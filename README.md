# Resume for Academic

This is an Academic Resume generator, modified from [antfu/resume](https://github.com/antfu/resume), which is heavy modified from [jsonresume-theme-kwan](https://github.com/icoloma/jsonresume-theme-kwan).

## How it works

- The data is shown in [resume.template](./resume.template), **NOT** fully adhering to [JSON Resume](https://jsonresume.org/) standard.
- You can host your data on [GitHub Gist](https://gist.github.com/) or local file in JSON format. For the former, you need to change the value of the `gist` variable in [build.js](./build.js).
- HTML is generated with [Handlebars](https://handlebarsjs.com/) and PDF is printed with [puppeteer](https://github.com/puppeteer/puppeteer/).
- I did a lot quick hacks to make it suitable for academic, which may not be good to be general used for other purposes. If you want to improve it for academic use, PRs are great welcome!

## Acknowledgements

[antfu/resume](https://github.com/antfu/resume)
[icoloma/jsonresume-theme-kwan](https://github.com/icoloma/jsonresume-theme-kwan)

## License

The script is licensed with MIT.
