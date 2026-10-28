var fs = require('fs');
var Handlebars = require('handlebars');
var gravatar = require('gravatar');
var _ = require('underscore');
var moment = require('moment');
var PurgeCSS = require('purgecss').PurgeCSS;

// Icon sets for toSocialIcon, rendered to inline SVG at build time instead of by a script in the page
var iconSets = {
  ri: require('@iconify-json/ri/icons.json'),
  academicons: require('@iconify-json/academicons/icons.json')
};

// Inline SVG for an icon like "ri:github-fill", or nothing for an unknown icon
function toSvg(name) {
  var parts = String(name).split(':');
  var set = iconSets[parts[0]];
  var icon = set && set.icons[parts[1]];
  if (!icon) {
    return '';
  }
  var width = icon.width || set.width || 16;
  var height = icon.height || set.height || 16;
  var viewBox = [icon.left || set.left || 0, icon.top || set.top || 0, width, height];
  // 1em tall and as wide as the icon's aspect ratio, rounded to 0.01em as the Iconify script did
  return '<svg class="iconify" width="' + Math.round(width / height * 100) / 100 + 'em" height="1em" viewBox="' + viewBox.join(' ') +
    '" aria-hidden="true" style="vertical-align: -0.125em">' + icon.body + '</svg>';
}

function hasEmail(resume) {
  return !!resume.basics && !!resume.basics.email;
}

function getDate(dateStr) {
  // A list of dates (e.g. an award received several times) is shown as "2024, 2025"
  if (Array.isArray(dateStr)) {
    return dateStr.map(getDate).join(', ');
  }
  var format = 'MMM YYYY';
  switch (dateStr.split('-').length) {
    case 1:
      format = 'YYYY';
      break;
    case 2:
      format = 'MMM YYYY';
      break;
    case 3:
      format = 'MMM D, YYYY';
      break;
    default:
      break;
  }
  // Parse as UTC so the shown date doesn't shift with the build machine's timezone
  return moment.utc(dateStr, ['YYYY-MM-DD', 'YYYY-MM', 'YYYY']).format(format);
}

// A venue like "Journal of Software (in Chinese)" keeps the language apart from the name
function splitVenue(venue) {
  var match = (venue || '').match(/^(.*?)\s*\((in [^)]+)\)$/);
  return match ? { name: match[1], language: match[2] } : { name: venue };
}

function isJournal(venue) {
  return /journal|transactions|letters/i.test(venue || '');
}

// The bare DOI, e.g. "10.1000/182", from a DOI or a doi.org link
function getDoi(doi) {
  return doi && doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
}

// Pages like "45(11):5784-5797": volume 45, issue 11, pages 5784 to 5797 (volume and issue are optional)
function splitPages(pages) {
  var match = String(pages || '').match(/^(?:(\d+)(?:\((\d+)\))?:)?(\d+)\s*[-–]+\s*(\d+)$/);
  return match && {
    volume: match[1] && String(+match[1]),
    number: match[2] && String(+match[2]),
    first: match[3],
    last: match[4]
  };
}

// Month and year as IEEE references write them: "Nov. 2026", "June 2025", or just "2026"
var ieeeMonths = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
function getIeeeDate(dateStr, space) {
  var parts = String(dateStr || '').split('-');
  return parts[1] ? ieeeMonths[+parts[1] - 1] + space + parts[0] : parts[0];
}

// Markup for the citation line on the page and in llms.txt
var citationHtml = {
  venue: function (name) { return '<i>' + name + '</i>'; },
  nowrap: function (text) { return '<span class="text-nowrap">' + text + '</span>'; },
  space: '&nbsp;',
  dash: '&ndash;'
};
var citationMarkdown = {
  venue: function (name) { return '*' + name + '*'; },
  nowrap: function (text) { return text; },
  space: ' ',
  dash: '–'
};

// Where a paper appeared, in IEEE reference style:
// journals "Venue, vol. 45, no. 11, pp. 5784–5797, Nov. 2026.",
// proceedings "In Venue, City, Nov. 2026, pp. 1–10.", and "to appear" until there are pages
function getCitation(publication_info, markup) {
  var venue = splitVenue(publication_info.venue);
  var pages = splitPages(publication_info.pages);
  var date = getIeeeDate(publication_info.startDate, markup.space) +
    (publication_info.endDate ? markup.dash + getIeeeDate(publication_info.endDate, markup.space) : '');
  var range = pages
    ? markup.nowrap('pp.' + markup.space + pages.first + markup.dash + pages.last)
    : publication_info.pages || '';
  var parts = isJournal(venue.name)
    ? [markup.venue(venue.name), pages && pages.volume && 'vol.' + markup.space + pages.volume,
      pages && pages.number && 'no.' + markup.space + pages.number, range, date]
    : ['In ' + markup.venue(venue.name), publication_info.location, date, range];
  if (!publication_info.pages) {
    parts.push('to appear');
  }
  parts = _.filter(parts, Boolean);
  // A note like "(in Chinese)" closes the reference
  return parts.join(', ') + (venue.language ? ' (' + venue.language + ')' : '') + '.';
}

// BibTeX for a publication, built from its fields unless a "bibtex" field is given
function getBibtex(publication_info) {
  if (publication_info.bibtex) {
    return publication_info.bibtex;
  }
  var authors = _.map(publication_info.authors, function (author) {
    return author.trim().replace(/\*$/, '');
  });
  var year = String(publication_info.startDate || '').split('-')[0];
  var firstWord = (publication_info.title.match(/[A-Za-z]+/) || [''])[0].toLowerCase();
  var key = (authors[0] || '').split(' ').pop().toLowerCase() + year + firstWord;
  var venue = splitVenue(publication_info.venue);
  var journal = isJournal(venue.name);
  var fields = [
    // Braces keep acronyms like FLAME capitalized
    ['title', publication_info.title.replace(/\b([A-Za-z]*[A-Z][A-Za-z]*[A-Z][A-Za-z]*)\b/g, '{$1}')],
    ['author', authors.join(' and ')],
    [journal ? 'journal' : 'booktitle', venue.name],
    ['year', year]
  ];
  var pages = splitPages(publication_info.pages);
  if (pages) {
    fields.push(['volume', pages.volume], ['number', pages.number], ['pages', pages.first + '--' + pages.last]);
  }
  fields.push(['doi', getDoi(publication_info.doi)]);
  // The venue's language goes into a note, e.g. "(in Chinese)"
  if (venue.language) {
    fields.push(['note', '(' + venue.language + ')']);
  }
  fields = _.filter(fields, function (field) { return field[1]; });
  return '@' + (journal ? 'article' : 'inproceedings') + '{' + key + ',\n' + _.map(fields, function (field) {
    return '  ' + field[0] + ' = {' + field[1] + '}';
  }).join(',\n') + '\n}';
}

// The page's title and description, which the gist's configs can set, and the plain-text summary
function getPageInfo(resume) {
  var configs = resume.configs || {};
  var summary = String(resume.basics.summary || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return {
    title: configs.title || resume.basics.name,
    description: configs.description || summary,
    summary: summary
  };
}

// schema.org data on the page, the person and their papers, for search engines and LLMs
function getJsonLd(resume, page) {
  var basics = resume.basics;
  var site = String((resume.configs || {}).site_url || '').replace(/\/$/, '');
  var person = { '@id': site + '/#person' };
  var articles = _.map(resume.publications, function (publication_info) {
    var venue = splitVenue(publication_info.venue);
    var doi = getDoi(publication_info.doi);
    var pages = splitPages(publication_info.pages);
    return {
      '@type': 'ScholarlyArticle',
      headline: publication_info.title,
      author: _.map(publication_info.authors, function (author) {
        var name = author.trim().replace(/\*$/, '');
        return name === basics.name ? person : { '@type': 'Person', name: name };
      }),
      datePublished: publication_info.startDate,
      isPartOf: { '@type': isJournal(venue.name) ? 'Periodical' : 'CreativeWork', name: venue.name },
      pageStart: pages ? pages.first : undefined,
      pageEnd: pages ? pages.last : undefined,
      url: doi ? 'https://doi.org/' + doi : publication_info.homepage || publication_info.pdf
    };
  });
  var data = {
    '@context': 'https://schema.org',
    '@graph': [{
      '@type': 'ProfilePage',
      '@id': site + '/',
      url: site + '/',
      name: page.title,
      dateModified: page.date,
      mainEntity: person
    }, {
      '@type': 'Person',
      '@id': person['@id'],
      name: basics.name,
      url: site + '/',
      image: page.image,
      jobTitle: basics.label,
      description: page.summary,
      email: basics.email && 'mailto:' + basics.email,
      // The line under the title, e.g. "Some Lab, Some University"
      affiliation: basics.address && { '@type': 'Organization', name: basics.address },
      alumniOf: _.map(_.uniq(_.pluck(_.filter(resume.education, 'endDate'), 'institution')), function (name) {
        return { '@type': 'CollegeOrUniversity', name: name };
      }),
      knowsAbout: _.pluck(resume.interests, 'topic'),
      award: _.pluck(resume.awards, 'title'),
      // Profiles elsewhere tell this person apart from others with the same name
      sameAs: _.pluck(basics.profiles, 'url'),
      // Papers as works this person wrote. Nested rather than at the top of the graph, where tools
      // like Readability take the first article for the page itself
      '@reverse': { author: articles }
    }]
  };
  // Leave out empty fields, and escape "<" so the data can't close its script tag
  return JSON.stringify(data, function (key, value) {
    return value === '' || (Array.isArray(value) && !value.length) ? undefined : value;
  }).replace(/</g, '\\u003c');
}

// Inline HTML from the gist (links, italics) as Markdown
function toMarkdown(html) {
  return String(html || '')
    .replace(/<a\s[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<\/?(i|em)>/gi, '*')
    .replace(/<\/?(b|strong)>/gi, '**')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// llms.txt: the resume as Markdown for LLMs (https://llmstxt.org)
function renderLlms(resume) {
  var site = String((resume.configs || {}).site_url || '').replace(/\/$/, '');
  var hb = Handlebars.create();
  hb.registerHelper('md', toMarkdown);
  hb.registerHelper('date', function (dateStr) {
    return dateStr ? getDate(dateStr) : '';
  });
  // "Junjie Chen*" marks the corresponding author
  hb.registerHelper('authors', function (authors) {
    return _.map(authors, function (author) {
      return author.trim().replace(/\*$/, ' (corresponding author)');
    }).join(', ');
  });
  hb.registerHelper('doiUrl', function (doi) {
    return 'https://doi.org/' + getDoi(doi);
  });
  hb.registerHelper('citation', function (publication_info) {
    return getCitation(publication_info, citationMarkdown);
  });
  var page = getPageInfo(resume);
  // Without a description of its own, the summary itself opens the file
  page.custom = !!(resume.configs || {}).description;
  var template = fs.readFileSync(__dirname + '/llms.hbs', 'utf-8');
  return hb.compile(template, { noEscape: true })({ resume: resume, page: page, site: site })
    .replace(/\n{3,}/g, '\n\n');
}

async function render(resume) {
  var css = fs.readFileSync(__dirname + '/assets/css/theme.css', 'utf-8'),
    template = fs.readFileSync(__dirname + '/resume.hbs', 'utf-8')

  if (!resume.basics.picture && hasEmail(resume)) {
    resume.basics.picture = gravatar.url(resume.basics.email.replace('(at)', '@'), {
      s: '100',
      r: 'pg',
      d: 'mm'
    });
  }

  var buildDate = moment();
  var page = getPageInfo(resume);

  // Link previews need an absolute photo URL, and build.js may have made it relative
  var image = resume.basics.picture && resume.configs && resume.configs.site_url
    ? new URL(resume.basics.picture, resume.configs.site_url + '/').href
    : resume.basics.picture;

  // Built from the raw data, before the fields below are reformatted for display
  var jsonLd = getJsonLd(resume, _.extend({ image: image, date: buildDate.format('YYYY-MM-DD') }, page));

  // An icon declared as SVG has to be one
  var iconSvg = /\.svg(?:[?#]|$)/i.test((resume.configs || {}).icon_svg || '') ? resume.configs.icon_svg : null;

  resume.basics.summary = new Handlebars.SafeString(resume.basics.summary);

  _.each(resume.news, function (news_info) {
    if (news_info.date) {
      news_info.title = new Handlebars.SafeString(news_info.title);
      news_info.date = getDate(news_info.date);
    }
  });

  _.each(resume.education, function (education_info) {
    _.each(['startDate', 'endDate'], function (date) {
      if (education_info[date]) {
        education_info[date] = getDate(education_info[date]);
      }
    });
    if (education_info.description) {
      education_info.description = new Handlebars.SafeString(education_info.description);
    }
  });

  // Authors marked with a trailing * get a "* Corresponding author" note
  var hasCorrespondingAuthor = _.some(resume.publications, function (publication_info) {
    return _.some(publication_info.authors, function (author) {
      return author.trim().endsWith('*');
    });
  });

  _.each(resume.publications, function (publication_info) {
    publication_info.bibtex = getBibtex(publication_info);
    // From the raw dates, before they are reformatted below
    var citation = getCitation(publication_info, citationHtml);
    _.each(['startDate', 'endDate'], function (date) {
      if (publication_info[date]) {
        publication_info[date] = getDate(publication_info[date]);
      }
    });
    var authorArr = [];
    _.each(publication_info.authors, function (author) {
      if (author.includes(resume.basics.name)) {
        authorArr.push('<strong>' + author + '</strong>');
      } else {
        authorArr.push(author);
      }
    });
    let formattedAuthors;
    if (authorArr.length <= 1) {
      formattedAuthors = authorArr.join('');
    } else {
      formattedAuthors = authorArr.slice(0, -1).join(', ') + ", and " + authorArr[authorArr.length - 1];
    }
    publication_info.authors = new Handlebars.SafeString(formattedAuthors + '.');

    publication_info.description = new Handlebars.SafeString(citation);
  });

  _.each(resume.patents, function (patent_info) {
    if (patent_info.date) {
      patent_info.date = getDate(patent_info.date);
    }
  });

  _.each(resume.talks, function (talk_info) {
    if (talk_info.date) {
      talk_info.date = getDate(talk_info.date);
    }
  });

  _.each(resume.services, function (service_info) {
    if (service_info.date) {
      service_info.date = getDate(service_info.date);
    }
  });

  _.each(resume.teaching, function (teaching_info) {
    if (teaching_info.date) {
      teaching_info.date = getDate(teaching_info.date);
    }
  });

  _.each(resume.opensource, function (opensource_info) {
    if (opensource_info.description) {
      opensource_info.description = new Handlebars.SafeString(opensource_info.description);
    }
  });

  _.each(resume.awards, function (award_info) {
    if (award_info.date) {
      award_info.date = getDate(award_info.date);
    }
  });

  Handlebars.registerHelper('toSocialIcon', function (text) {
    return new Handlebars.SafeString(toSvg({
      linkedin: 'ri:linkedin-box-fill',
      github: 'ri:github-fill',
      instagram: 'ri:instagram-line',
      twitter: 'ri:twitter-fill',
      website: 'ri:global-line',
      link: 'ri:link',
      portfolio: 'ri:account-circle-fill',
      scholar: 'ri:graduation-cap-fill',
      slides: 'ri:slideshow-2-line',
      orcid: 'academicons:orcid',
      researchgate: 'academicons:researchgate-square',
      video: 'ri:video-on-line',
      pdf: 'ri:file-pdf-line',
      homepage: 'ri:home-2-line',
      artifacts: 'ri:archive-line',
      code: 'ri:code-s-slash-line',
      repo: 'ri:github-line',
      bibtex: 'ri:double-quotes-l',
      poster: 'ri:layout-masonry-line'
    }[text.trim().toLowerCase()]));
  })

  Handlebars.registerHelper('join', function (arr) {
    return arr.join(', ')
  })

  Handlebars.registerHelper('breaklines', function(text) {
    text = Handlebars.Utils.escapeExpression(text);
    text = text.replace(/(\r\n|\n|\r)/gm, '<br>');
    return new Handlebars.SafeString(text);
  })

  Handlebars.registerHelper('getBuildDate', function(format) {
    return buildDate.format(format)
  })

  var html = Handlebars.compile(template)({
    css: '',
    resume: resume,
    title: page.title,
    description: page.description,
    image: image,
    iconSvg: iconSvg,
    jsonLd: jsonLd,
    hasCorrespondingAuthor: hasCorrespondingAuthor
  });

  // Inline only the CSS this page uses: all of Bootstrap would put ~120KB of CSS ahead of the content
  var used = await new PurgeCSS().purge({
    content: [{ raw: html, extension: 'html' }],
    css: [{ raw: css }],
    fontFace: true,
    keyframes: true
  });
  return html.replace('<style></style>', function () {
    return '<style>' + used[0].css + '</style>';
  });
}

module.exports = {
  render: render,
  renderLlms: renderLlms
};
