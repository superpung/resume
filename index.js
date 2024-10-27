var fs = require('fs');
var Handlebars = require('handlebars');
var gravatar = require('gravatar');
var _ = require('underscore');
var moment = require('moment');

function hasEmail(resume) {
  return !!resume.basics && !!resume.basics.email;
}

function getDate(dateStr) {
  format = 'MMM YYYY';
  switch (dateStr.split('-').length) {
    case 1:
      format = 'YYYY';
      break;
    case 2:
      format = 'MMM YYYY';
      break;
    case 3:
      format = 'MMM DD, YYYY';
      break;
    default:
      break;
  }
  return moment(new Date(dateStr)).format(format);
}

async function render(resume) {
  var css = fs.readFileSync(__dirname + '/assets/css/theme.css', 'utf-8'),
    template = fs.readFileSync(__dirname + '/resume.hbs', 'utf-8'),
    profiles = resume.basics.profiles,
    social_sites = ["github", "linkedin", "stackoverflow", "twitter",
      "soundcloud", "pinterest", "vimeo", "behance",
      "codepen", "foursquare", "reddit", "spotify",
      "dribble", "dribbble", "facebook", "angellist",
      "bitbucket", "skype"]

  if (!resume.basics.picture && hasEmail(resume)) {
    resume.basics.picture = gravatar.url(resume.basics.email.replace('(at)', '@'), {
      s: '100',
      r: 'pg',
      d: 'mm'
    });
  }

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
  });

  _.each(resume.publications, function (publication_info) {
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
    publication_info.authors = new Handlebars.SafeString(authorArr.join(',&nbsp;'));

    var description = [
      'In: <i>' + publication_info.venue + '</i>',
      publication_info.startDate + (publication_info.endDate ? ('-' + publication_info.endDate) : ''),
      'pages ' + (publication_info.pages ? publication_info.pages : 'to appear')
    ];
    if (publication_info.location) {
      description.push(publication_info.location);
    }
    publication_info.description = new Handlebars.SafeString(description.join(',&nbsp;') + '.');
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

  _.each(resume.awards, function (award_info) {
    if (award_info.date) {
      award_info.date = getDate(award_info.date);
    }
  });

  Handlebars.registerHelper('toSocialIcon', function (text) {
    return {
      linkedin: 'ri:linkedin-box-fill',
      github: 'ri:github-fill',
      instagram: 'ri:instagram-line',
      twitter: 'ri:twitter-fill',
      website: 'ri:global-line',
      link: 'ri:arrow-right-up-line',
      portfolio: 'ri:account-circle-fill',
      scholar: 'ri:graduation-cap-fill',
      slides: 'ri:slideshow-2-line',
      orcid: 'academicons:orcid'
    }[text.trim().toLowerCase()]
  })

  Handlebars.registerHelper('join', function (arr) {
    return arr.join(', ')
  })

  Handlebars.registerHelper('breaklines', function(text) {
    text = Handlebars.Utils.escapeExpression(text);
    text = text.replace(/(\r\n|\n|\r)/gm, '<br>');
    return new Handlebars.SafeString(text);
  })

  Handlebars.registerHelper('getBuildDate', function() {
    return moment().format('MMMM Do YYYY, h:mm:ss a')
  })

  return Handlebars.compile(template)({
    css: css,
    resume: resume
  });
}

module.exports = {
  render: render
};
