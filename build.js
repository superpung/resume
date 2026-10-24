const fs = require('fs-extra')
const path = require('path')
const axios = require('axios')
const puppeteer = require('puppeteer')
const sharp = require('sharp')

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
  console.log('Shrinking photo...')
  await buildAvatar(resume)
  console.log('Rendering...')
  const html = await require("./index.js").render(resume)
  console.log('Saving file...')
  fs.writeFileSync('./dist/index.html', html, 'utf-8')
  console.log('Done')
  return html
}

async function buildPDF() {
  const browser = await puppeteer.launch({ headless: true })
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
