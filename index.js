const debug = require('debug')('metalsmith-js-packer')
const Bluebird  = require('bluebird');
const cheerio = require('cheerio');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const uglify = require('uglify-js');
const rp = require('request-promise');


module.exports = options => {
  if (typeof options !== 'object' || options === null) {
    options = {};
  }

  let inline = options.inline || false;
  let siteRootPath = options.siteRootPath || '/';
  let ouputPath = options.ouputPath || 'assets/javascript/';
  let uglifyEnabled = options.uglify || true;
  let uglifyOptions = options.uglifyOptions || {};

  return (files, metalsmith, done) => {
    let scripts = {};
    let packedScripts = {};
    let remoteScriptsPromises = [];
    let packedScriptsUsage = {};

    for (let file in files) {
      // parse only builded html files
      if (!file.endsWith('.html')) {
        continue;
      }

      let $ = cheerio.load(files[file].contents.toString());
      let $scripts = $('script');

      let pageScripts = [];
      let pageScriptsHash;

      debug(`processing ${$scripts.length} scripts in "${file}" file`);
      debug(`> uglifing is ${uglifyEnabled ? 'enabled' : 'disabled'}`);

      $scripts.each((_, element) => {
        let $element = $(element);

        // here if a <script> element has a "src" attribute
        //  -> external script content
        if ($element.attr('src') && $element.data('packer') !== 'exclude') {
          let src = $element.attr('src');
          let scriptHash = crypto.createHash('sha1').update(src).digest("hex");

          // handle remote scripts (uniqness: src)
          //  - add remote script to pending scripts
          //  - fetch remote script in memory
          //  - uglify retrieved script once received
          //  - insert it in a cache to avoid to re download it
          //  - remove original <script> tag
          if (src.startsWith('//') || src.startsWith('http')) {
            debug(`+ remote script located at "${src}"`);

            if (scripts[scriptHash] === undefined) {
              debug(`+-->  processing remote script located at "${src}"`);

              if (src.startsWith('//')) {
                src = 'http:' + src
              }

              // allocate script to prevent multiple processing
              scripts[scriptHash] = ''

              // add remote script to pending scripts
              remoteScriptsPromises.push(rp(src).then(content => {
                if (!uglifyEnabled) {
                  scripts[scriptHash] = content;
                  return;
                }

                let uglified = uglify.minify(content, uglifyOptions);

                if (uglified.error) {
                  console.warn('Error while uglifining remote script ' + src + ': ', uglified.error);
                  scripts[scriptHash] = content;
                }
                else {
                  scripts[scriptHash] = uglified.code
                }
              }))
            }

            pageScripts.push(scriptHash);
          }

          // handle local scripts (uniqness: src)
          //  - load local script in memory
          //  - uglify retrieved script
          //  - insert it in a cache to avoid to re read it from fs
          //  - remove original <script> tag
          else {
            debug(`+ local script located at "${src}"`);

            if (scripts[scriptHash] === undefined) {
              debug(`+-->  processing local script located at "${src}"`);

              let scriptPath = path.join(metalsmith._directory, metalsmith._source, src)

              if (!fs.existsSync(scriptPath)) {
                console.warn(`File missing: ${scriptPath}`)
                return;
              }

              let content = fs.readFileSync(scriptPath, "utf8");

              if (!uglifyEnabled) {
                scripts[scriptHash] = content;
                return;
              }

              let uglified = uglify.minify(content, uglifyOptions);

              if (uglified.error) {
                console.warn('Error while uglifining local script ' + scriptPath + ': ', uglified.error);
                scripts[scriptHash] = content;
              }
              else {
                scripts[scriptHash] = uglified.code
              }
            }

            pageScripts.push(scriptHash);
          }

          $element.remove();
          return;
        }

        // no src ? is javascript ?
        //  -> internal script content (uniqness: content hash, sha1 might be enougth)
        //    - load tag content in memory
        //    - uglify retrieved script
        //    - remove original <script> tag
        else if (($element.attr('type') === 'text/javascript' || $element.attr('type') === undefined) && $element.data('packer') !== 'exclude') {
          let scriptHash = crypto.createHash('sha1').update($element.html()).digest("hex");

          debug(`+ inline script identified by "${scriptHash}"`);

          if (scripts[scriptHash] === undefined) {
            debug(`+-->  processing inline script identified by "${scriptHash}"`);

            let content = $element.html();

            if (!uglifyEnabled) {
              scripts[scriptHash] = content;
              return;
            }

            let uglified = uglify.minify(content, uglifyOptions);

            if (uglified.error) {
              console.warn('Error while uglifining inline script: ', uglified.error);
              scripts[scriptHash] = content;
            }
            else {
              scripts[scriptHash] = uglified.code
            }
          }

          pageScripts.push(scriptHash);

          $element.remove();
          return;
        }
        else {
          if ($element.data('packer') === 'exclude') {
            $element.removeAttr('data-packer');
            debug(`- skipping excluded script tag`);
          }
          else {
            debug(`- skipping unknown script tag in file "${file}"\n${$element.toString()}`);
          }
        }
      })

      // - if current page contains scripts, create a hash of script names this page needs
      // we will distinguish same grouped script usage with this
      if (pageScripts.length > 0) {
        pageScriptsHash = crypto.createHash('sha1').update(pageScripts.join('.')).digest("hex");
        packedScripts[pageScriptsHash] = pageScripts;

        packedScriptsUsage[pageScriptsHash] = packedScriptsUsage[pageScriptsHash] || [];
        packedScriptsUsage[pageScriptsHash].push(file);

        debug(`register usage of packed script "${pageScriptsHash}" for file "${file}"`);

        // include script reference only when inline mode is disabled
        if (!inline) {
          $('<script>').attr('src', siteRootPath + ouputPath + pageScriptsHash + '.min.js').appendTo('body');
        }

        files[file].contents = Buffer.from($.html(), 'utf-8');
      }
    }

    if (remoteScriptsPromises.length === 0) {
      remoteScriptsPromises.push(Bluebird.resolve());
    }

    // we can pack all scripts togethers once all pending remotes scripts are fetched
    Bluebird.all(remoteScriptsPromises)
      .then(() => {
        for(let pageScriptsHash in packedScripts) {
          debug(`create packed script "${pageScriptsHash}", used by ${packedScriptsUsage[pageScriptsHash].length} files`);

          let packedScript = '';

          for (let i = 0; i < packedScripts[pageScriptsHash].length; i++) {
            packedScript += scripts[packedScripts[pageScriptsHash][i]] + '\n'
          }


          // include script reference only when inline mode is enabled
          // else, add new packed file to metalsmith file list
          if (!inline) {
            debug(`write packed script "${pageScriptsHash}" in "${ouputPath + pageScriptsHash + '.min.js'}" file`);

            files[ouputPath + pageScriptsHash + '.min.js'] = {
              contents: Buffer.from(packedScript, 'utf-8')
            }
          }
          else {
            for (let file of packedScriptsUsage[pageScriptsHash]) {
              debug(`include packed script "${pageScriptsHash}" in "${file}" file`);

              let $ = cheerio.load(files[file].contents.toString());

              $('<script>').html(packedScript).appendTo('body');

              files[file].contents = Buffer.from($.html(), 'utf-8');
            }
          }
        }
      })
      .then(() => done())
      .catch(err => {
        throw new Error(err)
      })
  }
}
