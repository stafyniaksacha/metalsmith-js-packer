# metalsmith-js-packer
> Javascript packer/minifier/uglifier for metalsmith"

This plugin is a Javascript optimizer: it will pass on generated HTML, look for scripts tags (external, internal, inline) and bundle all script in one place.

You can chose to pack your script in one file, as this, packed script can be reused through multiple pages. Or you can directly insert packed script as inline script.

*If this plugin doesn't fit your needs, please don't hesitate to ask for feature requests.*

## Installation
```bash
npm install --save metalsmith-js-packer
```

## Usage

### Javascript API

The example bellow show the minimum code needed to pack your files.

```javascript
const metalsmith = require('metalsmith');
const jsPacker = require('metalsmith-js-packer');

metalsmith(__dirname)
  .source('./src')
  .use(jsPacker())
  .build();
```

### Examples

Here is an example with generated HTML output file

#### HTML Input

```html
<html>
  <head>
    <title>My awesome page !</title>

    <script src="//cdn.example.com/jquery.min.js" />
    <script src="//cdn.example.com/jquery-plugin.min.js" />
  </head>
  <body>

    <!-- let's imagine we have an awesome website here -->

    <script>
      var globalVariable = 'registered here';

      (function() {
        var contextedVariable = 'registered here';
      })();
    </script>

    <script src="/assets/javascript/application.js" />
  </body>
</html>
```

#### HTML Output

```html
<html>
  <head>
    <title>My awesome page !</title>
  </head>
  <body>

    <!-- let's imagine we have an awesome website here -->

    <script src="/assets/javascript/e6791aa54bf763f10700a88b38d578282663be53.min.js" />
  </body>
</html>
```
> Here we can see, all script tags are packed/uglified in one file,  
which is included and writed on filesystem

### Exclude script element from packing


#### HTML Input

```html
<html>
  <head>
    <title>My awesome page !</title>

    <script src="//cdn.example.com/jquery.min.js" />
    <script src="//cdn.example.com/jquery-plugin.min.js" />
  </head>
  <body>

    <!-- let's imagine we have an awesome website here -->

    <script data-packer="exclude">
      var globalVariable = 'registered here';

      (function() {
        var contextedVariable = 'registered here';
      })();
    </script>

    <script src="/assets/javascript/application.js" />
  </body>
</html>
```

#### HTML Output

```html
<html>
  <head>
    <title>My awesome page !</title>
  </head>
  <body>

    <!-- let's imagine we have an awesome website here -->

    <script>
      var globalVariable = 'registered here';

      (function() {
        var contextedVariable = 'registered here';
      })();
    </script>

    <!-- notice that hash has changed, and another file is created -->
    <script src="/assets/javascript/0cex1a4bquf764r4ge1relmb3v2ba3s8o6k3wetj.min.js" />
  </body>
</html>
```

## Options reference
| name   |  default  |  description  |
| --- | --- | --- |
| `inline` | `false` | if `true`, write packed content in a inline script tag instead of a local script |
| `siteRootPath` | `/` | Use if your site root path is not `/` |
| `outputPath` | `assets/javascript/` | Customize output location of packed script |
| `uglify` | `true` | Enable/disable script uglify |
| `uglifyOptions` | `{}` | Options passed to [uglify](https://www.npmjs.com/package/uglify-js) |
| `removeLocalSrc ` | `false` | If set to `true` local source files are not copied in build directory |

> hint: metalsmith-js-packer use debug
