const fs = require('fs-extra')
const path = require('path')
const axios = require('axios')
const puppeteer = require('puppeteer')
const sharp = require('sharp')
const theme = require('./index.js')

const gist = 'superpung/70eb33c0bbc20a8f9f5cbed84c43aed9'

// The page shows the photo at 100px, so serve a 300px copy (enough for 3x screens)
// from dist/ instead of the full-size original the gist links to
async function buildAvatar(resume) {
  const url = resume.basics && resume.basics.picture
  if (!/^https?:\/\//.test(url || '')) {
    return
  }
  try {
    const { data } = await axios.get(url, { responseType: 'arraybuffer' })
    await sharp(data)
      .resize(300, 300)
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85, mozjpeg: true })
      .toFile('./dist/avatar.jpg')
    resume.basics.picture = 'avatar.jpg'
  } catch (e) {
    console.warn(`Keeping the original photo, shrinking it failed: ${e.message}`)
  }
}

// The Nunito Sans files that assets/less/fonts.less loads from fonts/
async function buildFonts() {
  const files = path.join(__dirname, 'node_modules/@fontsource/nunito-sans/files')
  for (const name of ['latin-400', 'latin-ext-400', 'latin-700', 'latin-ext-700']) {
    await fs.copy(path.join(files, `nunito-sans-${name}-normal.woff2`), `./dist/fonts/nunito-sans-${name}-normal.woff2`)
  }
}

// Search results want a favicon that is a multiple of 48px and iOS an opaque 180px icon,
// so make both from the PNG icon the gist links to
async function buildIcons(resume) {
  const configs = resume.configs || {}
  if (!/^https?:\/\//.test(configs.icon_png || '')) {
    return
  }
  try {
    const { data } = await axios.get(configs.icon_png, { responseType: 'arraybuffer' })
    await sharp(data).resize(192, 192).png().toFile('./dist/favicon.png')
    await sharp(data).resize(180, 180).flatten({ background: '#ffffff' }).png().toFile('./dist/apple-touch-icon.png')
    configs.icon_png = 'favicon.png'
    configs.icon_apple = 'apple-touch-icon.png'
  } catch (e) {
    console.warn(`Keeping the original icon, resizing it failed: ${e.message}`)
  }
}

// Netlify headers: security headers for every page, and a file name for the PDF.
// The PDF keeps its /resume.pdf URL but is saved as e.g. "Jane_Doe_CV.pdf";
// filename* carries names with non-ASCII letters (RFC 6266), filename is the ASCII fallback.
function buildHeaders(resume) {
  const rules = [
    '/*',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  X-Frame-Options: DENY',
    "  Content-Security-Policy: frame-ancestors 'none'",
    '  Permissions-Policy: camera=(), microphone=(), geolocation=()'
  ]
  const words = String(resume.basics.name || '').split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  if (words.length) {
    const fileName = words.join('_') + '_CV.pdf'
    rules.push('/resume.pdf', `  Content-Disposition: inline; filename="${fileName.replace(/[^\w.]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`)
  }
  fs.writeFileSync('./dist/_headers', rules.join('\n') + '\n')
}

// Netlify also serves the site at <site name>.netlify.app; send that host to the real domain
function buildRedirects(site) {
  if (process.env.SITE_NAME && site) {
    fs.writeFileSync('./dist/_redirects', `https://${process.env.SITE_NAME}.netlify.app/* ${site}/:splat 301!\n`)
  }
}

// Files for crawlers: search engines and AI models may index, cite and learn from the site.
// llms.txt is the resume as Markdown (https://llmstxt.org).
function buildCrawlerFiles(site, raw) {
  const robots = [
    'User-agent: *',
    'Content-Signal: search=yes, ai-input=yes, ai-train=yes',
    'Allow: /'
  ]
  if (site) {
    const today = new Date().toISOString().slice(0, 10)
    fs.writeFileSync('./dist/sitemap.xml', [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...[`${site}/`, `${site}/resume.pdf`].map(url => `  <url><loc>${url}</loc><lastmod>${today}</lastmod></url>`),
      '</urlset>',
      ''
    ].join('\n'))
    robots.push('', `Sitemap: ${site}/sitemap.xml`)
  }
  fs.writeFileSync('./dist/robots.txt', robots.join('\n') + '\n')
  fs.writeFileSync('./dist/llms.txt', theme.renderLlms(raw))
}

async function buildHTML() {
  await fs.remove('./dist')
  await fs.ensureDir('./dist')

  let resume
  if (fs.existsSync('./resume.json')) {
    console.log(`Loading from locale "resume.json"`)
    resume = JSON.parse(fs.readFileSync('./resume.json', 'utf-8'))
  } else {
    console.log(`Downloading resume... [${gist}]`)
    const { data } = await axios.get(`https://gist.githubusercontent.com/${gist}/raw/resume.json`)
    resume = data
  }
  // Rendering rewrites fields for display; the crawler files start from the data as written
  const raw = JSON.parse(JSON.stringify(resume))
  const site = String((resume.configs || {}).site_url || '').replace(/\/$/, '')
  console.log('Shrinking photo and icons, copying fonts...')
  await buildAvatar(resume)
  await buildIcons(resume)
  await buildFonts()
  console.log('Rendering...')
  const html = await theme.render(resume)
  console.log('Saving files...')
  fs.writeFileSync('./dist/index.html', html, 'utf-8')
  buildHeaders(resume)
  buildRedirects(site)
  buildCrawlerFiles(site, raw)
  console.log('Done')
  return html
}

async function buildPDF() {
  // The saved page loads its fonts from files next to it, which Chrome blocks by default
  const browser = await puppeteer.launch({ headless: true, args: ['--allow-file-access-from-files'] })
  const page = await browser.newPage();
  console.log('Opening puppeteer...')
  // Open the saved page, not its HTML, so the photo's relative path resolves
  await page.goto('file://' + path.resolve('./dist/index.html'), { waitUntil: 'networkidle0' })
  console.log('Generating PDF...')
  const pdf = await page.pdf({
    format: 'A4',
    displayHeaderFooter: false,
    printBackground: true,
    margin: {
      top: '0.4in',
      bottom: '0.4in',
      left: '0.4in',
      right: '0.4in',
    }
  })
  await browser.close()
  console.log('Saving file...')
  fs.writeFileSync('./dist/resume.pdf', pdf)
  console.log('Done')
  return pdf
}

async function buildAll() {
  await buildHTML()
  await buildPDF()
}

buildAll().catch(e => {
  console.error(e)
  process.exit(1)
})
