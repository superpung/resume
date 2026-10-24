var fs = require('fs');
var Handlebars = require('handlebars');
var gravatar = require('gravatar');
var _ = require('underscore');
var moment = require('moment');

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
  // A venue like "Journal of Software (in Chinese)" keeps the language as a note
  var venueMatch = (publication_info.venue || '').match(/^(.*?)\s*\((in [^)]+)\)$/);
  var venue = venueMatch ? venueMatch[1] : publication_info.venue;
  var isJournal = /journal|transactions|letters/i.test(venue || '');
  var fields = [
    // Braces keep acronyms like FLAME capitalized
    ['title', publication_info.title.replace(/\b([A-Za-z]*[A-Z][A-Za-z]*[A-Z][A-Za-z]*)\b/g, '{$1}')],
    ['author', authors.join(' and ')],
    [isJournal ? 'journal' : 'booktitle', venue],
    ['year', year]
  ];
  // Pages like "36(06):2453-2476" hold the volume and number too
  var pagesMatch = String(publication_info.pages || '').match(/^(?:(\d+)(?:\((\d+)\))?:)?(\d+)\s*[-–]+\s*(\d+)$/);
  if (pagesMatch) {
    fields.push(['volume', pagesMatch[1]], ['number', pagesMatch[2]], ['pages', pagesMatch[3] + '--' + pagesMatch[4]]);
  }
  if (publication_info.doi) {
    fields.push(['doi', publication_info.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '')]);
  }
  if (venueMatch) {
    fields.push(['note', '(' + venueMatch[2] + ')']);
  }
  fields = _.filter(fields, function (field) { return field[1]; });
  return '@' + (isJournal ? 'article' : 'inproceedings') + '{' + key + ',\n' + _.map(fields, function (field) {
    return '  ' + field[0] + ' = {' + field[1] + '}';
  }).join(',\n') + '\n}';
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

  // Plain-text summary for the page description and link previews
  var description = String(resume.basics.summary || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

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

    var description = [
      'In: <i>' + publication_info.venue + '</i>',
      publication_info.startDate + (publication_info.endDate ? ('&ndash;' + publication_info.endDate) : ''),
      // Page ranges like "36(06):2453-2476" get an en dash and stay on one line
      publication_info.pages
        ? '<span class="text-nowrap">' + String(publication_info.pages).replace(/(\d)\s*[-–]+\s*(\d)/, '$1&ndash;$2') + '</span>'
        : 'pages to appear'
    ];
    if (publication_info.location) {
      description.push(publication_info.location);
    }
    // Plain spaces, so a narrow screen wraps between the parts rather than inside the venue
    publication_info.description = new Handlebars.SafeString(description.join(', ') + '.');
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

  var buildDate = moment();
  Handlebars.registerHelper('getBuildDate', function(format) {
    return buildDate.format(format)
  })

  return Handlebars.compile(template)({
    css: css,
    resume: resume,
    description: description,
    hasCorrespondingAuthor: hasCorrespondingAuthor
  });
}

module.exports = {
  render: render
};
