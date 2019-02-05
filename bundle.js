(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
// var createControls = require('./controls');
// const normalize = require('gl-vec3/normalize')
const glsl = require('glslify')
const loadImage = require('image-promise')


function random_list(size) {
    const result = [];
    for (var i = 0; i < size; i++) {
        result.push(Math.floor(255*Math.random()))
    }
    return result
}
function interpolate(a, b, v) {
    return [
        (1-v)*a[0]+ v*b[0],
        (1-v)*a[1]+ v*b[1],
        (1-v)*a[2]+ v*b[2],
        (1-v)*a[3]+ v*b[3]
    ]
}

require('regl')({
    pixelRatio: 1.0,
    extensions: [
        'oes_texture_float',
    ],
    optionalExtensions: [
        'oes_texture_half_float'
    ],
    attributes: {
        antialias: false
    },
    onDone: require('fail-nicely')(main)
});

function main(regl) {
    let w;
    let h;
    let scale = 1.0;

    let states = []

    let container = document.getElementById('container')
    let test = document.getElementById('test')
    let controlRoot = document.createElement('div');

    const clear_rect = require('./shaders/clear_rect.js')(regl)
    const initialize = require('./shaders/initialize.js')(regl)
    const transition = require('./shaders/transition.js')(regl)
    const compute = require('./shaders/compute.js')(regl)
    const draw = require('./shaders/draw.js')(regl)

    console.time('load_images')
    Promise.all([
        Promise.all([
            loadImage('imgs/title.png'),
            loadImage('imgs/gen_design.png')
        ]),
        Promise.all([
            loadImage('imgs/title_mobile.png'),
            loadImage('imgs/gen_design_mobile.png')
        ]),

    ]).then(([ images, mobile_images ]) => {
        console.timeEnd('load_images')

        const portrait_textures = mobile_images.map(regl.texture)
        const landscape_textures = images.map(regl.texture)
        let textures = landscape_textures

        const purple = [128/255, 66/255, 244/255, 1.0]
        const red = [214/255, 44/255, 98/255, 1.0]

        const state_colors = [
            [[.98, .98, .98, 1.0], purple],
            [[0, 0.0, .9, 1.0], [.92, .92, .92, 1.0]],
            // [purple, purple],
            [red, red]
        ]


        // console.log('onload')

        let colorA = state_colors[0][0]
        let colorB = state_colors[0][1]

        let rect = new Float32Array(4);
        let rectBuf = regl.buffer(rect);

        function scroll_index() {
            const step = container.scrollHeight / images.length
            const y = container.scrollTop
            const idx = Math.min(Math.floor(y / step), images.length -1)
            const percent = (y - idx*step) / step
            return [ idx, percent ]
        }

        let [ scroll_idx, scroll_percent ] = scroll_index()
        let last_scroll_idx = scroll_idx


        function restart() {
            console.log('restart')
            w = Math.floor(regl._gl.canvas.width * scale);
            h = Math.floor(regl._gl.canvas.height * scale);
            console.log(w, h)
            textures = w > 1200 ? landscape_textures : portrait_textures

            states = [0, 1].map(i => (states[i] || regl.framebuffer)({
                colorType: regl.hasExtension('oes_texture_half_float') ? 'half float' : 'float',
                width: w,
                height: h,
            }));
            const random = regl.texture({
              width: 512,
              height: 256,
              data: random_list(512*256*4)
            })
            initialize({ dst: states[0], texture: textures[0], random});
            update_scroll()
        }

        function update_scroll() {
            [scroll_idx, scroll_percent] = scroll_index()
            if (scroll_idx != last_scroll_idx) {
                console.log('transition', last_scroll_idx, scroll_idx)
                transition({
                    src: states[1],
                    dst: states[0],
                    old_texture: textures[last_scroll_idx],
                    new_texture: textures[scroll_idx],
                    random: regl.texture({
                        width: 512, height: 256, data: random_list(512*256*4)
                    })
                })
                last_scroll_idx = scroll_idx
            }

            let p = (scroll_percent)
            let foo
            if (scroll_idx == 0) {
                foo = p
            }
            if (p < 0.25) {
                foo = 0
            } else if (p > 0.75) {
                foo = 1.0
            } else {
                foo = (p-0.25) * 2.0
            }
            colorA = interpolate(state_colors[scroll_idx][0], state_colors[scroll_idx+1][0], foo)
            colorB = interpolate(state_colors[scroll_idx][1], state_colors[scroll_idx+1][1], foo)
            // console.log(scroll_percent, colorA)
        }

        container.addEventListener('scroll', (event) => {
            update_scroll()
        })

        restart()

        window.addEventListener('resize', restart)
        let itersPerFrame = 2
        let prevTime = null
        let slowCount = 0
        regl.frame(({tick, time}) => {
            if (prevTime) {
                var dt = time - prevTime;
                if (dt > 1.4 / 60) {
                    slowCount++;
                } else if (dt < 1.1 / 60) {
                    slowCount--;
                }
                if (slowCount > 10) {
                    slowCount = 0;
                    itersPerFrame = Math.max(1, itersPerFrame - 1);
                }
                if (slowCount < -10) {
                    slowCount = 0;
                    itersPerFrame = Math.min(10, itersPerFrame + 1);
                }
            }
            prevTime = time;

            for (var i = 0; i < itersPerFrame; i++) {
                compute({src: states[0], dst: states[1]});
                compute({src: states[1], dst: states[0]});
            }
            const bounds = test.getBoundingClientRect()
            clear_rect({
                dst: states[0],
                rect: [
                    bounds.left / window.innerWidth,
                    bounds.top / window.innerHeight,
                    bounds.right / window.innerWidth,
                    bounds.bottom / window.innerHeight
                ]
            });
            draw({ colorA, colorB, src: states[0] });
        })
    })
}
},{"./shaders/clear_rect.js":7,"./shaders/compute.js":8,"./shaders/draw.js":9,"./shaders/initialize.js":10,"./shaders/transition.js":11,"fail-nicely":2,"glslify":3,"image-promise":5,"regl":6}],2:[function(require,module,exports){
'use strict'

var h = require('h')

module.exports = failNicely

function failNicely (callback, options) {
  options = options || {}

  return function (err, data) {
    if (!err) {
      return callback && callback(data)
    }

    if (err instanceof Error) {
      err = err.name + ': ' + err.message
    } else if (typeof err !== 'string') {
      throw new Error('fail-nicely: Oops! the message must be a String or an Error. How ironic.')
    }

    var zIndex = options.zIndex === undefined ? 9999 : parseInt(options.zIndex)
    var bg = options.bg === undefined ? '#333' : options.bg
    var fg = options.fg === undefined ? '#fff' : options.fg
    var title = options.title === undefined ? 'Sorry!' : options.title
    var fontFamily = options.fontFamily === undefined ? 'Helvetica, Arial, sans-serif' : options.fontFamily
    var position = options.position === undefined ? 'fixed' : options.position
    var invert = options.invert === undefined ? false : !!options.invert

    if (invert) {
      var tmp = fg
      fg = bg
      bg = tmp
    }

    var overlayStyles = {
      position: position,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      'background-color': bg,
      color: fg,
      'text-align': 'center',
      'z-index': zIndex
    }

    var headingStyles = {
      'font-family': fontFamily
    }

    var explanationStyles = {
      'font-family': fontFamily,
      'max-width': '640px',
      'margin-left': 'auto',
      'margin-right': 'auto',
      'line-height': '1.4',
      'padding': '0 15px'
    }

    var containerStyles = {
      'transform': 'translate(0, -50%)',
      'margin-top': '50vh'
    }

    document.body.appendChild(h('div', {style: overlayStyles}, [
      h('div', {style: containerStyles}, [
        h('h1', title, {style: headingStyles}),
        h('p', err, {style: explanationStyles})
      ])
    ]))
  }
}

},{"h":4}],3:[function(require,module,exports){
module.exports = function(strings) {
  if (typeof strings === 'string') strings = [strings]
  var exprs = [].slice.call(arguments,1)
  var parts = []
  for (var i = 0; i < strings.length-1; i++) {
    parts.push(strings[i], exprs[i] || '')
  }
  parts.push(strings[i])
  return parts.join('')
}

},{}],4:[function(require,module,exports){
;(function () {

function h() {
  var args = [].slice.call(arguments), e = null
  function item (l) {
    
    function parseClass (string) {
      var m = string.split(/([\.#]?[a-zA-Z0-9_-]+)/)
      m.forEach(function (v) {
        var s = v.substring(1,v.length)
        if(!v) return 
        if(!e)
          e = document.createElement(v)
        else if (v[0] === '.')
          e.classList.add(s)
        else if (v[0] === '#')
          e.setAttribute('id', s)
        
      })
    }

    if(l == null)
      ;
    else if('string' === typeof l) {
      if(!e)
        parseClass(l)
      else
        e.appendChild(document.createTextNode(l))
    }
    else if('number' === typeof l 
      || 'boolean' === typeof l
      || l instanceof Date 
      || l instanceof RegExp ) {
        e.appendChild(document.createTextNode(l.toString()))
    }
    else if (Array.isArray(l))
      l.forEach(item)
    else if(l instanceof HTMLElement)
      e.appendChild(l)
    else if ('object' === typeof l) {
      for (var k in l) {
        if('function' === typeof l[k])
          e.addEventListener(k, l[k])
        else if(k === 'style') {
          for (var s in l[k])
            e.style.setProperty(s, l[k][s])
        }
        else
          e.setAttribute(k, l[k])
      }
    }
  }
  while(args.length) {
    item(args.shift())
  }
  return e
}

if(typeof module === 'object')
  module.exports = h
else
  this.h = h
})()

},{}],5:[function(require,module,exports){
/*! npm.im/image-promise 6.0.0 */
'use strict';

function load(image, attributes) {
	if (!image) {
		return Promise.reject();
	} else if (typeof image === 'string') {
		/* Create a <img> from a string */
		var src = image;
		image = new Image();
		Object.keys(attributes || {}).forEach(
			function (name) { return image.setAttribute(name, attributes[name]); }
		);
		image.src = src;
	} else if (image.length !== undefined) {
		/* Treat as multiple images */

		// Momentarily ignore errors
		var reflected = [].map.call(image, function (img) { return load(img, attributes).catch(function (err) { return err; }); });

		return Promise.all(reflected).then(function (results) {
			var loaded = results.filter(function (x) { return x.naturalWidth; });
			if (loaded.length === results.length) {
				return loaded;
			}
			return Promise.reject({
				loaded: loaded,
				errored: results.filter(function (x) { return !x.naturalWidth; })
			});
		});
	} else if (image.tagName !== 'IMG') {
		return Promise.reject();
	}

	var promise = new Promise(function (resolve, reject) {
		if (image.naturalWidth) {
			// If the browser can determine the naturalWidth the
			// image is already loaded successfully
			resolve(image);
		} else if (image.complete) {
			// If the image is complete but the naturalWidth is 0px
			// it is probably broken
			reject(image);
		} else {
			image.addEventListener('load', fullfill);
			image.addEventListener('error', fullfill);
		}
		function fullfill() {
			if (image.naturalWidth) {
				resolve(image);
			} else {
				reject(image);
			}
			image.removeEventListener('load', fullfill);
			image.removeEventListener('error', fullfill);
		}
	});
	promise.image = image;
	return promise;
}

module.exports = load;

},{}],6:[function(require,module,exports){
(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	(global.createREGL = factory());
}(this, (function () { 'use strict';

var isTypedArray = function (x) {
  return (
    x instanceof Uint8Array ||
    x instanceof Uint16Array ||
    x instanceof Uint32Array ||
    x instanceof Int8Array ||
    x instanceof Int16Array ||
    x instanceof Int32Array ||
    x instanceof Float32Array ||
    x instanceof Float64Array ||
    x instanceof Uint8ClampedArray
  )
};

var extend = function (base, opts) {
  var keys = Object.keys(opts);
  for (var i = 0; i < keys.length; ++i) {
    base[keys[i]] = opts[keys[i]];
  }
  return base
};

// Error checking and parameter validation.
//
// Statements for the form `check.someProcedure(...)` get removed by
// a browserify transform for optimized/minified bundles.
//
/* globals atob */
var endl = '\n';

// only used for extracting shader names.  if atob not present, then errors
// will be slightly crappier
function decodeB64 (str) {
  if (typeof atob !== 'undefined') {
    return atob(str)
  }
  return 'base64:' + str
}

function raise (message) {
  var error = new Error('(regl) ' + message);
  console.error(error);
  throw error
}

function check (pred, message) {
  if (!pred) {
    raise(message);
  }
}

function encolon (message) {
  if (message) {
    return ': ' + message
  }
  return ''
}

function checkParameter (param, possibilities, message) {
  if (!(param in possibilities)) {
    raise('unknown parameter (' + param + ')' + encolon(message) +
          '. possible values: ' + Object.keys(possibilities).join());
  }
}

function checkIsTypedArray (data, message) {
  if (!isTypedArray(data)) {
    raise(
      'invalid parameter type' + encolon(message) +
      '. must be a typed array');
  }
}

function checkTypeOf (value, type, message) {
  if (typeof value !== type) {
    raise(
      'invalid parameter type' + encolon(message) +
      '. expected ' + type + ', got ' + (typeof value));
  }
}

function checkNonNegativeInt (value, message) {
  if (!((value >= 0) &&
        ((value | 0) === value))) {
    raise('invalid parameter type, (' + value + ')' + encolon(message) +
          '. must be a nonnegative integer');
  }
}

function checkOneOf (value, list, message) {
  if (list.indexOf(value) < 0) {
    raise('invalid value' + encolon(message) + '. must be one of: ' + list);
  }
}

var constructorKeys = [
  'gl',
  'canvas',
  'container',
  'attributes',
  'pixelRatio',
  'extensions',
  'optionalExtensions',
  'profile',
  'onDone'
];

function checkConstructor (obj) {
  Object.keys(obj).forEach(function (key) {
    if (constructorKeys.indexOf(key) < 0) {
      raise('invalid regl constructor argument "' + key + '". must be one of ' + constructorKeys);
    }
  });
}

function leftPad (str, n) {
  str = str + '';
  while (str.length < n) {
    str = ' ' + str;
  }
  return str
}

function ShaderFile () {
  this.name = 'unknown';
  this.lines = [];
  this.index = {};
  this.hasErrors = false;
}

function ShaderLine (number, line) {
  this.number = number;
  this.line = line;
  this.errors = [];
}

function ShaderError (fileNumber, lineNumber, message) {
  this.file = fileNumber;
  this.line = lineNumber;
  this.message = message;
}

function guessCommand () {
  var error = new Error();
  var stack = (error.stack || error).toString();
  var pat = /compileProcedure.*\n\s*at.*\((.*)\)/.exec(stack);
  if (pat) {
    return pat[1]
  }
  var pat2 = /compileProcedure.*\n\s*at\s+(.*)(\n|$)/.exec(stack);
  if (pat2) {
    return pat2[1]
  }
  return 'unknown'
}

function guessCallSite () {
  var error = new Error();
  var stack = (error.stack || error).toString();
  var pat = /at REGLCommand.*\n\s+at.*\((.*)\)/.exec(stack);
  if (pat) {
    return pat[1]
  }
  var pat2 = /at REGLCommand.*\n\s+at\s+(.*)\n/.exec(stack);
  if (pat2) {
    return pat2[1]
  }
  return 'unknown'
}

function parseSource (source, command) {
  var lines = source.split('\n');
  var lineNumber = 1;
  var fileNumber = 0;
  var files = {
    unknown: new ShaderFile(),
    0: new ShaderFile()
  };
  files.unknown.name = files[0].name = command || guessCommand();
  files.unknown.lines.push(new ShaderLine(0, ''));
  for (var i = 0; i < lines.length; ++i) {
    var line = lines[i];
    var parts = /^\s*\#\s*(\w+)\s+(.+)\s*$/.exec(line);
    if (parts) {
      switch (parts[1]) {
        case 'line':
          var lineNumberInfo = /(\d+)(\s+\d+)?/.exec(parts[2]);
          if (lineNumberInfo) {
            lineNumber = lineNumberInfo[1] | 0;
            if (lineNumberInfo[2]) {
              fileNumber = lineNumberInfo[2] | 0;
              if (!(fileNumber in files)) {
                files[fileNumber] = new ShaderFile();
              }
            }
          }
          break
        case 'define':
          var nameInfo = /SHADER_NAME(_B64)?\s+(.*)$/.exec(parts[2]);
          if (nameInfo) {
            files[fileNumber].name = (nameInfo[1]
                ? decodeB64(nameInfo[2])
                : nameInfo[2]);
          }
          break
      }
    }
    files[fileNumber].lines.push(new ShaderLine(lineNumber++, line));
  }
  Object.keys(files).forEach(function (fileNumber) {
    var file = files[fileNumber];
    file.lines.forEach(function (line) {
      file.index[line.number] = line;
    });
  });
  return files
}

function parseErrorLog (errLog) {
  var result = [];
  errLog.split('\n').forEach(function (errMsg) {
    if (errMsg.length < 5) {
      return
    }
    var parts = /^ERROR\:\s+(\d+)\:(\d+)\:\s*(.*)$/.exec(errMsg);
    if (parts) {
      result.push(new ShaderError(
        parts[1] | 0,
        parts[2] | 0,
        parts[3].trim()));
    } else if (errMsg.length > 0) {
      result.push(new ShaderError('unknown', 0, errMsg));
    }
  });
  return result
}

function annotateFiles (files, errors) {
  errors.forEach(function (error) {
    var file = files[error.file];
    if (file) {
      var line = file.index[error.line];
      if (line) {
        line.errors.push(error);
        file.hasErrors = true;
        return
      }
    }
    files.unknown.hasErrors = true;
    files.unknown.lines[0].errors.push(error);
  });
}

function checkShaderError (gl, shader, source, type, command) {
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    var errLog = gl.getShaderInfoLog(shader);
    var typeName = type === gl.FRAGMENT_SHADER ? 'fragment' : 'vertex';
    checkCommandType(source, 'string', typeName + ' shader source must be a string', command);
    var files = parseSource(source, command);
    var errors = parseErrorLog(errLog);
    annotateFiles(files, errors);

    Object.keys(files).forEach(function (fileNumber) {
      var file = files[fileNumber];
      if (!file.hasErrors) {
        return
      }

      var strings = [''];
      var styles = [''];

      function push (str, style) {
        strings.push(str);
        styles.push(style || '');
      }

      push('file number ' + fileNumber + ': ' + file.name + '\n', 'color:red;text-decoration:underline;font-weight:bold');

      file.lines.forEach(function (line) {
        if (line.errors.length > 0) {
          push(leftPad(line.number, 4) + '|  ', 'background-color:yellow; font-weight:bold');
          push(line.line + endl, 'color:red; background-color:yellow; font-weight:bold');

          // try to guess token
          var offset = 0;
          line.errors.forEach(function (error) {
            var message = error.message;
            var token = /^\s*\'(.*)\'\s*\:\s*(.*)$/.exec(message);
            if (token) {
              var tokenPat = token[1];
              message = token[2];
              switch (tokenPat) {
                case 'assign':
                  tokenPat = '=';
                  break
              }
              offset = Math.max(line.line.indexOf(tokenPat, offset), 0);
            } else {
              offset = 0;
            }

            push(leftPad('| ', 6));
            push(leftPad('^^^', offset + 3) + endl, 'font-weight:bold');
            push(leftPad('| ', 6));
            push(message + endl, 'font-weight:bold');
          });
          push(leftPad('| ', 6) + endl);
        } else {
          push(leftPad(line.number, 4) + '|  ');
          push(line.line + endl, 'color:red');
        }
      });
      if (typeof document !== 'undefined' && !window.chrome) {
        styles[0] = strings.join('%c');
        console.log.apply(console, styles);
      } else {
        console.log(strings.join(''));
      }
    });

    check.raise('Error compiling ' + typeName + ' shader, ' + files[0].name);
  }
}

function checkLinkError (gl, program, fragShader, vertShader, command) {
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    var errLog = gl.getProgramInfoLog(program);
    var fragParse = parseSource(fragShader, command);
    var vertParse = parseSource(vertShader, command);

    var header = 'Error linking program with vertex shader, "' +
      vertParse[0].name + '", and fragment shader "' + fragParse[0].name + '"';

    if (typeof document !== 'undefined') {
      console.log('%c' + header + endl + '%c' + errLog,
        'color:red;text-decoration:underline;font-weight:bold',
        'color:red');
    } else {
      console.log(header + endl + errLog);
    }
    check.raise(header);
  }
}

function saveCommandRef (object) {
  object._commandRef = guessCommand();
}

function saveDrawCommandInfo (opts, uniforms, attributes, stringStore) {
  saveCommandRef(opts);

  function id (str) {
    if (str) {
      return stringStore.id(str)
    }
    return 0
  }
  opts._fragId = id(opts.static.frag);
  opts._vertId = id(opts.static.vert);

  function addProps (dict, set) {
    Object.keys(set).forEach(function (u) {
      dict[stringStore.id(u)] = true;
    });
  }

  var uniformSet = opts._uniformSet = {};
  addProps(uniformSet, uniforms.static);
  addProps(uniformSet, uniforms.dynamic);

  var attributeSet = opts._attributeSet = {};
  addProps(attributeSet, attributes.static);
  addProps(attributeSet, attributes.dynamic);

  opts._hasCount = (
    'count' in opts.static ||
    'count' in opts.dynamic ||
    'elements' in opts.static ||
    'elements' in opts.dynamic);
}

function commandRaise (message, command) {
  var callSite = guessCallSite();
  raise(message +
    ' in command ' + (command || guessCommand()) +
    (callSite === 'unknown' ? '' : ' called from ' + callSite));
}

function checkCommand (pred, message, command) {
  if (!pred) {
    commandRaise(message, command || guessCommand());
  }
}

function checkParameterCommand (param, possibilities, message, command) {
  if (!(param in possibilities)) {
    commandRaise(
      'unknown parameter (' + param + ')' + encolon(message) +
      '. possible values: ' + Object.keys(possibilities).join(),
      command || guessCommand());
  }
}

function checkCommandType (value, type, message, command) {
  if (typeof value !== type) {
    commandRaise(
      'invalid parameter type' + encolon(message) +
      '. expected ' + type + ', got ' + (typeof value),
      command || guessCommand());
  }
}

function checkOptional (block) {
  block();
}

function checkFramebufferFormat (attachment, texFormats, rbFormats) {
  if (attachment.texture) {
    checkOneOf(
      attachment.texture._texture.internalformat,
      texFormats,
      'unsupported texture format for attachment');
  } else {
    checkOneOf(
      attachment.renderbuffer._renderbuffer.format,
      rbFormats,
      'unsupported renderbuffer format for attachment');
  }
}

var GL_CLAMP_TO_EDGE = 0x812F;

var GL_NEAREST = 0x2600;
var GL_NEAREST_MIPMAP_NEAREST = 0x2700;
var GL_LINEAR_MIPMAP_NEAREST = 0x2701;
var GL_NEAREST_MIPMAP_LINEAR = 0x2702;
var GL_LINEAR_MIPMAP_LINEAR = 0x2703;

var GL_BYTE = 5120;
var GL_UNSIGNED_BYTE = 5121;
var GL_SHORT = 5122;
var GL_UNSIGNED_SHORT = 5123;
var GL_INT = 5124;
var GL_UNSIGNED_INT = 5125;
var GL_FLOAT = 5126;

var GL_UNSIGNED_SHORT_4_4_4_4 = 0x8033;
var GL_UNSIGNED_SHORT_5_5_5_1 = 0x8034;
var GL_UNSIGNED_SHORT_5_6_5 = 0x8363;
var GL_UNSIGNED_INT_24_8_WEBGL = 0x84FA;

var GL_HALF_FLOAT_OES = 0x8D61;

var TYPE_SIZE = {};

TYPE_SIZE[GL_BYTE] =
TYPE_SIZE[GL_UNSIGNED_BYTE] = 1;

TYPE_SIZE[GL_SHORT] =
TYPE_SIZE[GL_UNSIGNED_SHORT] =
TYPE_SIZE[GL_HALF_FLOAT_OES] =
TYPE_SIZE[GL_UNSIGNED_SHORT_5_6_5] =
TYPE_SIZE[GL_UNSIGNED_SHORT_4_4_4_4] =
TYPE_SIZE[GL_UNSIGNED_SHORT_5_5_5_1] = 2;

TYPE_SIZE[GL_INT] =
TYPE_SIZE[GL_UNSIGNED_INT] =
TYPE_SIZE[GL_FLOAT] =
TYPE_SIZE[GL_UNSIGNED_INT_24_8_WEBGL] = 4;

function pixelSize (type, channels) {
  if (type === GL_UNSIGNED_SHORT_5_5_5_1 ||
      type === GL_UNSIGNED_SHORT_4_4_4_4 ||
      type === GL_UNSIGNED_SHORT_5_6_5) {
    return 2
  } else if (type === GL_UNSIGNED_INT_24_8_WEBGL) {
    return 4
  } else {
    return TYPE_SIZE[type] * channels
  }
}

function isPow2 (v) {
  return !(v & (v - 1)) && (!!v)
}

function checkTexture2D (info, mipData, limits) {
  var i;
  var w = mipData.width;
  var h = mipData.height;
  var c = mipData.channels;

  // Check texture shape
  check(w > 0 && w <= limits.maxTextureSize &&
        h > 0 && h <= limits.maxTextureSize,
        'invalid texture shape');

  // check wrap mode
  if (info.wrapS !== GL_CLAMP_TO_EDGE || info.wrapT !== GL_CLAMP_TO_EDGE) {
    check(isPow2(w) && isPow2(h),
      'incompatible wrap mode for texture, both width and height must be power of 2');
  }

  if (mipData.mipmask === 1) {
    if (w !== 1 && h !== 1) {
      check(
        info.minFilter !== GL_NEAREST_MIPMAP_NEAREST &&
        info.minFilter !== GL_NEAREST_MIPMAP_LINEAR &&
        info.minFilter !== GL_LINEAR_MIPMAP_NEAREST &&
        info.minFilter !== GL_LINEAR_MIPMAP_LINEAR,
        'min filter requires mipmap');
    }
  } else {
    // texture must be power of 2
    check(isPow2(w) && isPow2(h),
      'texture must be a square power of 2 to support mipmapping');
    check(mipData.mipmask === (w << 1) - 1,
      'missing or incomplete mipmap data');
  }

  if (mipData.type === GL_FLOAT) {
    if (limits.extensions.indexOf('oes_texture_float_linear') < 0) {
      check(info.minFilter === GL_NEAREST && info.magFilter === GL_NEAREST,
        'filter not supported, must enable oes_texture_float_linear');
    }
    check(!info.genMipmaps,
      'mipmap generation not supported with float textures');
  }

  // check image complete
  var mipimages = mipData.images;
  for (i = 0; i < 16; ++i) {
    if (mipimages[i]) {
      var mw = w >> i;
      var mh = h >> i;
      check(mipData.mipmask & (1 << i), 'missing mipmap data');

      var img = mipimages[i];

      check(
        img.width === mw &&
        img.height === mh,
        'invalid shape for mip images');

      check(
        img.format === mipData.format &&
        img.internalformat === mipData.internalformat &&
        img.type === mipData.type,
        'incompatible type for mip image');

      if (img.compressed) {
        // TODO: check size for compressed images
      } else if (img.data) {
        // check(img.data.byteLength === mw * mh *
        // Math.max(pixelSize(img.type, c), img.unpackAlignment),
        var rowSize = Math.ceil(pixelSize(img.type, c) * mw / img.unpackAlignment) * img.unpackAlignment;
        check(img.data.byteLength === rowSize * mh,
          'invalid data for image, buffer size is inconsistent with image format');
      } else if (img.element) {
        // TODO: check element can be loaded
      } else if (img.copy) {
        // TODO: check compatible format and type
      }
    } else if (!info.genMipmaps) {
      check((mipData.mipmask & (1 << i)) === 0, 'extra mipmap data');
    }
  }

  if (mipData.compressed) {
    check(!info.genMipmaps,
      'mipmap generation for compressed images not supported');
  }
}

function checkTextureCube (texture, info, faces, limits) {
  var w = texture.width;
  var h = texture.height;
  var c = texture.channels;

  // Check texture shape
  check(
    w > 0 && w <= limits.maxTextureSize && h > 0 && h <= limits.maxTextureSize,
    'invalid texture shape');
  check(
    w === h,
    'cube map must be square');
  check(
    info.wrapS === GL_CLAMP_TO_EDGE && info.wrapT === GL_CLAMP_TO_EDGE,
    'wrap mode not supported by cube map');

  for (var i = 0; i < faces.length; ++i) {
    var face = faces[i];
    check(
      face.width === w && face.height === h,
      'inconsistent cube map face shape');

    if (info.genMipmaps) {
      check(!face.compressed,
        'can not generate mipmap for compressed textures');
      check(face.mipmask === 1,
        'can not specify mipmaps and generate mipmaps');
    } else {
      // TODO: check mip and filter mode
    }

    var mipmaps = face.images;
    for (var j = 0; j < 16; ++j) {
      var img = mipmaps[j];
      if (img) {
        var mw = w >> j;
        var mh = h >> j;
        check(face.mipmask & (1 << j), 'missing mipmap data');
        check(
          img.width === mw &&
          img.height === mh,
          'invalid shape for mip images');
        check(
          img.format === texture.format &&
          img.internalformat === texture.internalformat &&
          img.type === texture.type,
          'incompatible type for mip image');

        if (img.compressed) {
          // TODO: check size for compressed images
        } else if (img.data) {
          check(img.data.byteLength === mw * mh *
            Math.max(pixelSize(img.type, c), img.unpackAlignment),
            'invalid data for image, buffer size is inconsistent with image format');
        } else if (img.element) {
          // TODO: check element can be loaded
        } else if (img.copy) {
          // TODO: check compatible format and type
        }
      }
    }
  }
}

var check$1 = extend(check, {
  optional: checkOptional,
  raise: raise,
  commandRaise: commandRaise,
  command: checkCommand,
  parameter: checkParameter,
  commandParameter: checkParameterCommand,
  constructor: checkConstructor,
  type: checkTypeOf,
  commandType: checkCommandType,
  isTypedArray: checkIsTypedArray,
  nni: checkNonNegativeInt,
  oneOf: checkOneOf,
  shaderError: checkShaderError,
  linkError: checkLinkError,
  callSite: guessCallSite,
  saveCommandRef: saveCommandRef,
  saveDrawInfo: saveDrawCommandInfo,
  framebufferFormat: checkFramebufferFormat,
  guessCommand: guessCommand,
  texture2D: checkTexture2D,
  textureCube: checkTextureCube
});

var VARIABLE_COUNTER = 0;

var DYN_FUNC = 0;

function DynamicVariable (type, data) {
  this.id = (VARIABLE_COUNTER++);
  this.type = type;
  this.data = data;
}

function escapeStr (str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function splitParts (str) {
  if (str.length === 0) {
    return []
  }

  var firstChar = str.charAt(0);
  var lastChar = str.charAt(str.length - 1);

  if (str.length > 1 &&
      firstChar === lastChar &&
      (firstChar === '"' || firstChar === "'")) {
    return ['"' + escapeStr(str.substr(1, str.length - 2)) + '"']
  }

  var parts = /\[(false|true|null|\d+|'[^']*'|"[^"]*")\]/.exec(str);
  if (parts) {
    return (
      splitParts(str.substr(0, parts.index))
      .concat(splitParts(parts[1]))
      .concat(splitParts(str.substr(parts.index + parts[0].length)))
    )
  }

  var subparts = str.split('.');
  if (subparts.length === 1) {
    return ['"' + escapeStr(str) + '"']
  }

  var result = [];
  for (var i = 0; i < subparts.length; ++i) {
    result = result.concat(splitParts(subparts[i]));
  }
  return result
}

function toAccessorString (str) {
  return '[' + splitParts(str).join('][') + ']'
}

function defineDynamic (type, data) {
  return new DynamicVariable(type, toAccessorString(data + ''))
}

function isDynamic (x) {
  return (typeof x === 'function' && !x._reglType) ||
         x instanceof DynamicVariable
}

function unbox (x, path) {
  if (typeof x === 'function') {
    return new DynamicVariable(DYN_FUNC, x)
  }
  return x
}

var dynamic = {
  DynamicVariable: DynamicVariable,
  define: defineDynamic,
  isDynamic: isDynamic,
  unbox: unbox,
  accessor: toAccessorString
};

/* globals requestAnimationFrame, cancelAnimationFrame */
var raf = {
  next: typeof requestAnimationFrame === 'function'
    ? function (cb) { return requestAnimationFrame(cb) }
    : function (cb) { return setTimeout(cb, 16) },
  cancel: typeof cancelAnimationFrame === 'function'
    ? function (raf) { return cancelAnimationFrame(raf) }
    : clearTimeout
};

/* globals performance */
var clock = (typeof performance !== 'undefined' && performance.now)
  ? function () { return performance.now() }
  : function () { return +(new Date()) };

function createStringStore () {
  var stringIds = {'': 0};
  var stringValues = [''];
  return {
    id: function (str) {
      var result = stringIds[str];
      if (result) {
        return result
      }
      result = stringIds[str] = stringValues.length;
      stringValues.push(str);
      return result
    },

    str: function (id) {
      return stringValues[id]
    }
  }
}

// Context and canvas creation helper functions
function createCanvas (element, onDone, pixelRatio) {
  var canvas = document.createElement('canvas');
  extend(canvas.style, {
    border: 0,
    margin: 0,
    padding: 0,
    top: 0,
    left: 0
  });
  element.appendChild(canvas);

  if (element === document.body) {
    canvas.style.position = 'absolute';
    extend(element.style, {
      margin: 0,
      padding: 0
    });
  }

  function resize () {
    var w = window.innerWidth;
    var h = window.innerHeight;
    if (element !== document.body) {
      var bounds = element.getBoundingClientRect();
      w = bounds.right - bounds.left;
      h = bounds.bottom - bounds.top;
    }
    canvas.width = pixelRatio * w;
    canvas.height = pixelRatio * h;
    extend(canvas.style, {
      width: w + 'px',
      height: h + 'px'
    });
  }

  window.addEventListener('resize', resize, false);

  function onDestroy () {
    window.removeEventListener('resize', resize);
    element.removeChild(canvas);
  }

  resize();

  return {
    canvas: canvas,
    onDestroy: onDestroy
  }
}

function createContext (canvas, contextAttributes) {
  function get (name) {
    try {
      return canvas.getContext(name, contextAttributes)
    } catch (e) {
      return null
    }
  }
  return (
    get('webgl') ||
    get('experimental-webgl') ||
    get('webgl-experimental')
  )
}

function isHTMLElement (obj) {
  return (
    typeof obj.nodeName === 'string' &&
    typeof obj.appendChild === 'function' &&
    typeof obj.getBoundingClientRect === 'function'
  )
}

function isWebGLContext (obj) {
  return (
    typeof obj.drawArrays === 'function' ||
    typeof obj.drawElements === 'function'
  )
}

function parseExtensions (input) {
  if (typeof input === 'string') {
    return input.split()
  }
  check$1(Array.isArray(input), 'invalid extension array');
  return input
}

function getElement (desc) {
  if (typeof desc === 'string') {
    check$1(typeof document !== 'undefined', 'not supported outside of DOM');
    return document.querySelector(desc)
  }
  return desc
}

function parseArgs (args_) {
  var args = args_ || {};
  var element, container, canvas, gl;
  var contextAttributes = {};
  var extensions = [];
  var optionalExtensions = [];
  var pixelRatio = (typeof window === 'undefined' ? 1 : window.devicePixelRatio);
  var profile = false;
  var onDone = function (err) {
    if (err) {
      check$1.raise(err);
    }
  };
  var onDestroy = function () {};
  if (typeof args === 'string') {
    check$1(
      typeof document !== 'undefined',
      'selector queries only supported in DOM enviroments');
    element = document.querySelector(args);
    check$1(element, 'invalid query string for element');
  } else if (typeof args === 'object') {
    if (isHTMLElement(args)) {
      element = args;
    } else if (isWebGLContext(args)) {
      gl = args;
      canvas = gl.canvas;
    } else {
      check$1.constructor(args);
      if ('gl' in args) {
        gl = args.gl;
      } else if ('canvas' in args) {
        canvas = getElement(args.canvas);
      } else if ('container' in args) {
        container = getElement(args.container);
      }
      if ('attributes' in args) {
        contextAttributes = args.attributes;
        check$1.type(contextAttributes, 'object', 'invalid context attributes');
      }
      if ('extensions' in args) {
        extensions = parseExtensions(args.extensions);
      }
      if ('optionalExtensions' in args) {
        optionalExtensions = parseExtensions(args.optionalExtensions);
      }
      if ('onDone' in args) {
        check$1.type(
          args.onDone, 'function',
          'invalid or missing onDone callback');
        onDone = args.onDone;
      }
      if ('profile' in args) {
        profile = !!args.profile;
      }
      if ('pixelRatio' in args) {
        pixelRatio = +args.pixelRatio;
        check$1(pixelRatio > 0, 'invalid pixel ratio');
      }
    }
  } else {
    check$1.raise('invalid arguments to regl');
  }

  if (element) {
    if (element.nodeName.toLowerCase() === 'canvas') {
      canvas = element;
    } else {
      container = element;
    }
  }

  if (!gl) {
    if (!canvas) {
      check$1(
        typeof document !== 'undefined',
        'must manually specify webgl context outside of DOM environments');
      var result = createCanvas(container || document.body, onDone, pixelRatio);
      if (!result) {
        return null
      }
      canvas = result.canvas;
      onDestroy = result.onDestroy;
    }
    gl = createContext(canvas, contextAttributes);
  }

  if (!gl) {
    onDestroy();
    onDone('webgl not supported, try upgrading your browser or graphics drivers http://get.webgl.org');
    return null
  }

  return {
    gl: gl,
    canvas: canvas,
    container: container,
    extensions: extensions,
    optionalExtensions: optionalExtensions,
    pixelRatio: pixelRatio,
    profile: profile,
    onDone: onDone,
    onDestroy: onDestroy
  }
}

function createExtensionCache (gl, config) {
  var extensions = {};

  function tryLoadExtension (name_) {
    check$1.type(name_, 'string', 'extension name must be string');
    var name = name_.toLowerCase();
    var ext;
    try {
      ext = extensions[name] = gl.getExtension(name);
    } catch (e) {}
    return !!ext
  }

  for (var i = 0; i < config.extensions.length; ++i) {
    var name = config.extensions[i];
    if (!tryLoadExtension(name)) {
      config.onDestroy();
      config.onDone('"' + name + '" extension is not supported by the current WebGL context, try upgrading your system or a different browser');
      return null
    }
  }

  config.optionalExtensions.forEach(tryLoadExtension);

  return {
    extensions: extensions,
    restore: function () {
      Object.keys(extensions).forEach(function (name) {
        if (extensions[name] && !tryLoadExtension(name)) {
          throw new Error('(regl): error restoring extension ' + name)
        }
      });
    }
  }
}

function loop (n, f) {
  var result = Array(n);
  for (var i = 0; i < n; ++i) {
    result[i] = f(i);
  }
  return result
}

var GL_BYTE$1 = 5120;
var GL_UNSIGNED_BYTE$2 = 5121;
var GL_SHORT$1 = 5122;
var GL_UNSIGNED_SHORT$1 = 5123;
var GL_INT$1 = 5124;
var GL_UNSIGNED_INT$1 = 5125;
var GL_FLOAT$2 = 5126;

function nextPow16 (v) {
  for (var i = 16; i <= (1 << 28); i *= 16) {
    if (v <= i) {
      return i
    }
  }
  return 0
}

function log2 (v) {
  var r, shift;
  r = (v > 0xFFFF) << 4;
  v >>>= r;
  shift = (v > 0xFF) << 3;
  v >>>= shift; r |= shift;
  shift = (v > 0xF) << 2;
  v >>>= shift; r |= shift;
  shift = (v > 0x3) << 1;
  v >>>= shift; r |= shift;
  return r | (v >> 1)
}

function createPool () {
  var bufferPool = loop(8, function () {
    return []
  });

  function alloc (n) {
    var sz = nextPow16(n);
    var bin = bufferPool[log2(sz) >> 2];
    if (bin.length > 0) {
      return bin.pop()
    }
    return new ArrayBuffer(sz)
  }

  function free (buf) {
    bufferPool[log2(buf.byteLength) >> 2].push(buf);
  }

  function allocType (type, n) {
    var result = null;
    switch (type) {
      case GL_BYTE$1:
        result = new Int8Array(alloc(n), 0, n);
        break
      case GL_UNSIGNED_BYTE$2:
        result = new Uint8Array(alloc(n), 0, n);
        break
      case GL_SHORT$1:
        result = new Int16Array(alloc(2 * n), 0, n);
        break
      case GL_UNSIGNED_SHORT$1:
        result = new Uint16Array(alloc(2 * n), 0, n);
        break
      case GL_INT$1:
        result = new Int32Array(alloc(4 * n), 0, n);
        break
      case GL_UNSIGNED_INT$1:
        result = new Uint32Array(alloc(4 * n), 0, n);
        break
      case GL_FLOAT$2:
        result = new Float32Array(alloc(4 * n), 0, n);
        break
      default:
        return null
    }
    if (result.length !== n) {
      return result.subarray(0, n)
    }
    return result
  }

  function freeType (array) {
    free(array.buffer);
  }

  return {
    alloc: alloc,
    free: free,
    allocType: allocType,
    freeType: freeType
  }
}

var pool = createPool();

// zero pool for initial zero data
pool.zero = createPool();

var GL_SUBPIXEL_BITS = 0x0D50;
var GL_RED_BITS = 0x0D52;
var GL_GREEN_BITS = 0x0D53;
var GL_BLUE_BITS = 0x0D54;
var GL_ALPHA_BITS = 0x0D55;
var GL_DEPTH_BITS = 0x0D56;
var GL_STENCIL_BITS = 0x0D57;

var GL_ALIASED_POINT_SIZE_RANGE = 0x846D;
var GL_ALIASED_LINE_WIDTH_RANGE = 0x846E;

var GL_MAX_TEXTURE_SIZE = 0x0D33;
var GL_MAX_VIEWPORT_DIMS = 0x0D3A;
var GL_MAX_VERTEX_ATTRIBS = 0x8869;
var GL_MAX_VERTEX_UNIFORM_VECTORS = 0x8DFB;
var GL_MAX_VARYING_VECTORS = 0x8DFC;
var GL_MAX_COMBINED_TEXTURE_IMAGE_UNITS = 0x8B4D;
var GL_MAX_VERTEX_TEXTURE_IMAGE_UNITS = 0x8B4C;
var GL_MAX_TEXTURE_IMAGE_UNITS = 0x8872;
var GL_MAX_FRAGMENT_UNIFORM_VECTORS = 0x8DFD;
var GL_MAX_CUBE_MAP_TEXTURE_SIZE = 0x851C;
var GL_MAX_RENDERBUFFER_SIZE = 0x84E8;

var GL_VENDOR = 0x1F00;
var GL_RENDERER = 0x1F01;
var GL_VERSION = 0x1F02;
var GL_SHADING_LANGUAGE_VERSION = 0x8B8C;

var GL_MAX_TEXTURE_MAX_ANISOTROPY_EXT = 0x84FF;

var GL_MAX_COLOR_ATTACHMENTS_WEBGL = 0x8CDF;
var GL_MAX_DRAW_BUFFERS_WEBGL = 0x8824;

var GL_TEXTURE_2D = 0x0DE1;
var GL_TEXTURE_CUBE_MAP = 0x8513;
var GL_TEXTURE_CUBE_MAP_POSITIVE_X = 0x8515;
var GL_TEXTURE0 = 0x84C0;
var GL_RGBA = 0x1908;
var GL_FLOAT$1 = 0x1406;
var GL_UNSIGNED_BYTE$1 = 0x1401;
var GL_FRAMEBUFFER = 0x8D40;
var GL_FRAMEBUFFER_COMPLETE = 0x8CD5;
var GL_COLOR_ATTACHMENT0 = 0x8CE0;
var GL_COLOR_BUFFER_BIT$1 = 0x4000;

var wrapLimits = function (gl, extensions) {
  var maxAnisotropic = 1;
  if (extensions.ext_texture_filter_anisotropic) {
    maxAnisotropic = gl.getParameter(GL_MAX_TEXTURE_MAX_ANISOTROPY_EXT);
  }

  var maxDrawbuffers = 1;
  var maxColorAttachments = 1;
  if (extensions.webgl_draw_buffers) {
    maxDrawbuffers = gl.getParameter(GL_MAX_DRAW_BUFFERS_WEBGL);
    maxColorAttachments = gl.getParameter(GL_MAX_COLOR_ATTACHMENTS_WEBGL);
  }

  // detect if reading float textures is available (Safari doesn't support)
  var readFloat = !!extensions.oes_texture_float;
  if (readFloat) {
    var readFloatTexture = gl.createTexture();
    gl.bindTexture(GL_TEXTURE_2D, readFloatTexture);
    gl.texImage2D(GL_TEXTURE_2D, 0, GL_RGBA, 1, 1, 0, GL_RGBA, GL_FLOAT$1, null);

    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(GL_FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, readFloatTexture, 0);
    gl.bindTexture(GL_TEXTURE_2D, null);

    if (gl.checkFramebufferStatus(GL_FRAMEBUFFER) !== GL_FRAMEBUFFER_COMPLETE) readFloat = false;

    else {
      gl.viewport(0, 0, 1, 1);
      gl.clearColor(1.0, 0.0, 0.0, 1.0);
      gl.clear(GL_COLOR_BUFFER_BIT$1);
      var pixels = pool.allocType(GL_FLOAT$1, 4);
      gl.readPixels(0, 0, 1, 1, GL_RGBA, GL_FLOAT$1, pixels);

      if (gl.getError()) readFloat = false;
      else {
        gl.deleteFramebuffer(fbo);
        gl.deleteTexture(readFloatTexture);

        readFloat = pixels[0] === 1.0;
      }

      pool.freeType(pixels);
    }
  }

  // detect non power of two cube textures support (IE doesn't support)
  var isIE = typeof navigator !== 'undefined' && (/MSIE/.test(navigator.userAgent) || /Trident\//.test(navigator.appVersion) || /Edge/.test(navigator.userAgent));

  var npotTextureCube = true;

  if (!isIE) {
    var cubeTexture = gl.createTexture();
    var data = pool.allocType(GL_UNSIGNED_BYTE$1, 36);
    gl.activeTexture(GL_TEXTURE0);
    gl.bindTexture(GL_TEXTURE_CUBE_MAP, cubeTexture);
    gl.texImage2D(GL_TEXTURE_CUBE_MAP_POSITIVE_X, 0, GL_RGBA, 3, 3, 0, GL_RGBA, GL_UNSIGNED_BYTE$1, data);
    pool.freeType(data);
    gl.bindTexture(GL_TEXTURE_CUBE_MAP, null);
    gl.deleteTexture(cubeTexture);
    npotTextureCube = !gl.getError();
  }

  return {
    // drawing buffer bit depth
    colorBits: [
      gl.getParameter(GL_RED_BITS),
      gl.getParameter(GL_GREEN_BITS),
      gl.getParameter(GL_BLUE_BITS),
      gl.getParameter(GL_ALPHA_BITS)
    ],
    depthBits: gl.getParameter(GL_DEPTH_BITS),
    stencilBits: gl.getParameter(GL_STENCIL_BITS),
    subpixelBits: gl.getParameter(GL_SUBPIXEL_BITS),

    // supported extensions
    extensions: Object.keys(extensions).filter(function (ext) {
      return !!extensions[ext]
    }),

    // max aniso samples
    maxAnisotropic: maxAnisotropic,

    // max draw buffers
    maxDrawbuffers: maxDrawbuffers,
    maxColorAttachments: maxColorAttachments,

    // point and line size ranges
    pointSizeDims: gl.getParameter(GL_ALIASED_POINT_SIZE_RANGE),
    lineWidthDims: gl.getParameter(GL_ALIASED_LINE_WIDTH_RANGE),
    maxViewportDims: gl.getParameter(GL_MAX_VIEWPORT_DIMS),
    maxCombinedTextureUnits: gl.getParameter(GL_MAX_COMBINED_TEXTURE_IMAGE_UNITS),
    maxCubeMapSize: gl.getParameter(GL_MAX_CUBE_MAP_TEXTURE_SIZE),
    maxRenderbufferSize: gl.getParameter(GL_MAX_RENDERBUFFER_SIZE),
    maxTextureUnits: gl.getParameter(GL_MAX_TEXTURE_IMAGE_UNITS),
    maxTextureSize: gl.getParameter(GL_MAX_TEXTURE_SIZE),
    maxAttributes: gl.getParameter(GL_MAX_VERTEX_ATTRIBS),
    maxVertexUniforms: gl.getParameter(GL_MAX_VERTEX_UNIFORM_VECTORS),
    maxVertexTextureUnits: gl.getParameter(GL_MAX_VERTEX_TEXTURE_IMAGE_UNITS),
    maxVaryingVectors: gl.getParameter(GL_MAX_VARYING_VECTORS),
    maxFragmentUniforms: gl.getParameter(GL_MAX_FRAGMENT_UNIFORM_VECTORS),

    // vendor info
    glsl: gl.getParameter(GL_SHADING_LANGUAGE_VERSION),
    renderer: gl.getParameter(GL_RENDERER),
    vendor: gl.getParameter(GL_VENDOR),
    version: gl.getParameter(GL_VERSION),

    // quirks
    readFloat: readFloat,
    npotTextureCube: npotTextureCube
  }
};

function isNDArrayLike (obj) {
  return (
    !!obj &&
    typeof obj === 'object' &&
    Array.isArray(obj.shape) &&
    Array.isArray(obj.stride) &&
    typeof obj.offset === 'number' &&
    obj.shape.length === obj.stride.length &&
    (Array.isArray(obj.data) ||
      isTypedArray(obj.data)))
}

var values = function (obj) {
  return Object.keys(obj).map(function (key) { return obj[key] })
};

var flattenUtils = {
  shape: arrayShape$1,
  flatten: flattenArray
};

function flatten1D (array, nx, out) {
  for (var i = 0; i < nx; ++i) {
    out[i] = array[i];
  }
}

function flatten2D (array, nx, ny, out) {
  var ptr = 0;
  for (var i = 0; i < nx; ++i) {
    var row = array[i];
    for (var j = 0; j < ny; ++j) {
      out[ptr++] = row[j];
    }
  }
}

function flatten3D (array, nx, ny, nz, out, ptr_) {
  var ptr = ptr_;
  for (var i = 0; i < nx; ++i) {
    var row = array[i];
    for (var j = 0; j < ny; ++j) {
      var col = row[j];
      for (var k = 0; k < nz; ++k) {
        out[ptr++] = col[k];
      }
    }
  }
}

function flattenRec (array, shape, level, out, ptr) {
  var stride = 1;
  for (var i = level + 1; i < shape.length; ++i) {
    stride *= shape[i];
  }
  var n = shape[level];
  if (shape.length - level === 4) {
    var nx = shape[level + 1];
    var ny = shape[level + 2];
    var nz = shape[level + 3];
    for (i = 0; i < n; ++i) {
      flatten3D(array[i], nx, ny, nz, out, ptr);
      ptr += stride;
    }
  } else {
    for (i = 0; i < n; ++i) {
      flattenRec(array[i], shape, level + 1, out, ptr);
      ptr += stride;
    }
  }
}

function flattenArray (array, shape, type, out_) {
  var sz = 1;
  if (shape.length) {
    for (var i = 0; i < shape.length; ++i) {
      sz *= shape[i];
    }
  } else {
    sz = 0;
  }
  var out = out_ || pool.allocType(type, sz);
  switch (shape.length) {
    case 0:
      break
    case 1:
      flatten1D(array, shape[0], out);
      break
    case 2:
      flatten2D(array, shape[0], shape[1], out);
      break
    case 3:
      flatten3D(array, shape[0], shape[1], shape[2], out, 0);
      break
    default:
      flattenRec(array, shape, 0, out, 0);
  }
  return out
}

function arrayShape$1 (array_) {
  var shape = [];
  for (var array = array_; array.length; array = array[0]) {
    shape.push(array.length);
  }
  return shape
}

var arrayTypes = {
	"[object Int8Array]": 5120,
	"[object Int16Array]": 5122,
	"[object Int32Array]": 5124,
	"[object Uint8Array]": 5121,
	"[object Uint8ClampedArray]": 5121,
	"[object Uint16Array]": 5123,
	"[object Uint32Array]": 5125,
	"[object Float32Array]": 5126,
	"[object Float64Array]": 5121,
	"[object ArrayBuffer]": 5121
};

var int8 = 5120;
var int16 = 5122;
var int32 = 5124;
var uint8 = 5121;
var uint16 = 5123;
var uint32 = 5125;
var float = 5126;
var float32 = 5126;
var glTypes = {
	int8: int8,
	int16: int16,
	int32: int32,
	uint8: uint8,
	uint16: uint16,
	uint32: uint32,
	float: float,
	float32: float32
};

var dynamic$1 = 35048;
var stream = 35040;
var usageTypes = {
	dynamic: dynamic$1,
	stream: stream,
	"static": 35044
};

var arrayFlatten = flattenUtils.flatten;
var arrayShape = flattenUtils.shape;

var GL_STATIC_DRAW = 0x88E4;
var GL_STREAM_DRAW = 0x88E0;

var GL_UNSIGNED_BYTE$3 = 5121;
var GL_FLOAT$3 = 5126;

var DTYPES_SIZES = [];
DTYPES_SIZES[5120] = 1; // int8
DTYPES_SIZES[5122] = 2; // int16
DTYPES_SIZES[5124] = 4; // int32
DTYPES_SIZES[5121] = 1; // uint8
DTYPES_SIZES[5123] = 2; // uint16
DTYPES_SIZES[5125] = 4; // uint32
DTYPES_SIZES[5126] = 4; // float32

function typedArrayCode (data) {
  return arrayTypes[Object.prototype.toString.call(data)] | 0
}

function copyArray (out, inp) {
  for (var i = 0; i < inp.length; ++i) {
    out[i] = inp[i];
  }
}

function transpose (
  result, data, shapeX, shapeY, strideX, strideY, offset) {
  var ptr = 0;
  for (var i = 0; i < shapeX; ++i) {
    for (var j = 0; j < shapeY; ++j) {
      result[ptr++] = data[strideX * i + strideY * j + offset];
    }
  }
}

function wrapBufferState (gl, stats, config, attributeState) {
  var bufferCount = 0;
  var bufferSet = {};

  function REGLBuffer (type) {
    this.id = bufferCount++;
    this.buffer = gl.createBuffer();
    this.type = type;
    this.usage = GL_STATIC_DRAW;
    this.byteLength = 0;
    this.dimension = 1;
    this.dtype = GL_UNSIGNED_BYTE$3;

    this.persistentData = null;

    if (config.profile) {
      this.stats = {size: 0};
    }
  }

  REGLBuffer.prototype.bind = function () {
    gl.bindBuffer(this.type, this.buffer);
  };

  REGLBuffer.prototype.destroy = function () {
    destroy(this);
  };

  var streamPool = [];

  function createStream (type, data) {
    var buffer = streamPool.pop();
    if (!buffer) {
      buffer = new REGLBuffer(type);
    }
    buffer.bind();
    initBufferFromData(buffer, data, GL_STREAM_DRAW, 0, 1, false);
    return buffer
  }

  function destroyStream (stream$$1) {
    streamPool.push(stream$$1);
  }

  function initBufferFromTypedArray (buffer, data, usage) {
    buffer.byteLength = data.byteLength;
    gl.bufferData(buffer.type, data, usage);
  }

  function initBufferFromData (buffer, data, usage, dtype, dimension, persist) {
    var shape;
    buffer.usage = usage;
    if (Array.isArray(data)) {
      buffer.dtype = dtype || GL_FLOAT$3;
      if (data.length > 0) {
        var flatData;
        if (Array.isArray(data[0])) {
          shape = arrayShape(data);
          var dim = 1;
          for (var i = 1; i < shape.length; ++i) {
            dim *= shape[i];
          }
          buffer.dimension = dim;
          flatData = arrayFlatten(data, shape, buffer.dtype);
          initBufferFromTypedArray(buffer, flatData, usage);
          if (persist) {
            buffer.persistentData = flatData;
          } else {
            pool.freeType(flatData);
          }
        } else if (typeof data[0] === 'number') {
          buffer.dimension = dimension;
          var typedData = pool.allocType(buffer.dtype, data.length);
          copyArray(typedData, data);
          initBufferFromTypedArray(buffer, typedData, usage);
          if (persist) {
            buffer.persistentData = typedData;
          } else {
            pool.freeType(typedData);
          }
        } else if (isTypedArray(data[0])) {
          buffer.dimension = data[0].length;
          buffer.dtype = dtype || typedArrayCode(data[0]) || GL_FLOAT$3;
          flatData = arrayFlatten(
            data,
            [data.length, data[0].length],
            buffer.dtype);
          initBufferFromTypedArray(buffer, flatData, usage);
          if (persist) {
            buffer.persistentData = flatData;
          } else {
            pool.freeType(flatData);
          }
        } else {
          check$1.raise('invalid buffer data');
        }
      }
    } else if (isTypedArray(data)) {
      buffer.dtype = dtype || typedArrayCode(data);
      buffer.dimension = dimension;
      initBufferFromTypedArray(buffer, data, usage);
      if (persist) {
        buffer.persistentData = new Uint8Array(new Uint8Array(data.buffer));
      }
    } else if (isNDArrayLike(data)) {
      shape = data.shape;
      var stride = data.stride;
      var offset = data.offset;

      var shapeX = 0;
      var shapeY = 0;
      var strideX = 0;
      var strideY = 0;
      if (shape.length === 1) {
        shapeX = shape[0];
        shapeY = 1;
        strideX = stride[0];
        strideY = 0;
      } else if (shape.length === 2) {
        shapeX = shape[0];
        shapeY = shape[1];
        strideX = stride[0];
        strideY = stride[1];
      } else {
        check$1.raise('invalid shape');
      }

      buffer.dtype = dtype || typedArrayCode(data.data) || GL_FLOAT$3;
      buffer.dimension = shapeY;

      var transposeData = pool.allocType(buffer.dtype, shapeX * shapeY);
      transpose(transposeData,
        data.data,
        shapeX, shapeY,
        strideX, strideY,
        offset);
      initBufferFromTypedArray(buffer, transposeData, usage);
      if (persist) {
        buffer.persistentData = transposeData;
      } else {
        pool.freeType(transposeData);
      }
    } else {
      check$1.raise('invalid buffer data');
    }
  }

  function destroy (buffer) {
    stats.bufferCount--;

    for (var i = 0; i < attributeState.state.length; ++i) {
      var record = attributeState.state[i];
      if (record.buffer === buffer) {
        gl.disableVertexAttribArray(i);
        record.buffer = null;
      }
    }

    var handle = buffer.buffer;
    check$1(handle, 'buffer must not be deleted already');
    gl.deleteBuffer(handle);
    buffer.buffer = null;
    delete bufferSet[buffer.id];
  }

  function createBuffer (options, type, deferInit, persistent) {
    stats.bufferCount++;

    var buffer = new REGLBuffer(type);
    bufferSet[buffer.id] = buffer;

    function reglBuffer (options) {
      var usage = GL_STATIC_DRAW;
      var data = null;
      var byteLength = 0;
      var dtype = 0;
      var dimension = 1;
      if (Array.isArray(options) ||
          isTypedArray(options) ||
          isNDArrayLike(options)) {
        data = options;
      } else if (typeof options === 'number') {
        byteLength = options | 0;
      } else if (options) {
        check$1.type(
          options, 'object',
          'buffer arguments must be an object, a number or an array');

        if ('data' in options) {
          check$1(
            data === null ||
            Array.isArray(data) ||
            isTypedArray(data) ||
            isNDArrayLike(data),
            'invalid data for buffer');
          data = options.data;
        }

        if ('usage' in options) {
          check$1.parameter(options.usage, usageTypes, 'invalid buffer usage');
          usage = usageTypes[options.usage];
        }

        if ('type' in options) {
          check$1.parameter(options.type, glTypes, 'invalid buffer type');
          dtype = glTypes[options.type];
        }

        if ('dimension' in options) {
          check$1.type(options.dimension, 'number', 'invalid dimension');
          dimension = options.dimension | 0;
        }

        if ('length' in options) {
          check$1.nni(byteLength, 'buffer length must be a nonnegative integer');
          byteLength = options.length | 0;
        }
      }

      buffer.bind();
      if (!data) {
        // #475
        if (byteLength) gl.bufferData(buffer.type, byteLength, usage);
        buffer.dtype = dtype || GL_UNSIGNED_BYTE$3;
        buffer.usage = usage;
        buffer.dimension = dimension;
        buffer.byteLength = byteLength;
      } else {
        initBufferFromData(buffer, data, usage, dtype, dimension, persistent);
      }

      if (config.profile) {
        buffer.stats.size = buffer.byteLength * DTYPES_SIZES[buffer.dtype];
      }

      return reglBuffer
    }

    function setSubData (data, offset) {
      check$1(offset + data.byteLength <= buffer.byteLength,
        'invalid buffer subdata call, buffer is too small. ' + ' Can\'t write data of size ' + data.byteLength + ' starting from offset ' + offset + ' to a buffer of size ' + buffer.byteLength);

      gl.bufferSubData(buffer.type, offset, data);
    }

    function subdata (data, offset_) {
      var offset = (offset_ || 0) | 0;
      var shape;
      buffer.bind();
      if (isTypedArray(data)) {
        setSubData(data, offset);
      } else if (Array.isArray(data)) {
        if (data.length > 0) {
          if (typeof data[0] === 'number') {
            var converted = pool.allocType(buffer.dtype, data.length);
            copyArray(converted, data);
            setSubData(converted, offset);
            pool.freeType(converted);
          } else if (Array.isArray(data[0]) || isTypedArray(data[0])) {
            shape = arrayShape(data);
            var flatData = arrayFlatten(data, shape, buffer.dtype);
            setSubData(flatData, offset);
            pool.freeType(flatData);
          } else {
            check$1.raise('invalid buffer data');
          }
        }
      } else if (isNDArrayLike(data)) {
        shape = data.shape;
        var stride = data.stride;

        var shapeX = 0;
        var shapeY = 0;
        var strideX = 0;
        var strideY = 0;
        if (shape.length === 1) {
          shapeX = shape[0];
          shapeY = 1;
          strideX = stride[0];
          strideY = 0;
        } else if (shape.length === 2) {
          shapeX = shape[0];
          shapeY = shape[1];
          strideX = stride[0];
          strideY = stride[1];
        } else {
          check$1.raise('invalid shape');
        }
        var dtype = Array.isArray(data.data)
          ? buffer.dtype
          : typedArrayCode(data.data);

        var transposeData = pool.allocType(dtype, shapeX * shapeY);
        transpose(transposeData,
          data.data,
          shapeX, shapeY,
          strideX, strideY,
          data.offset);
        setSubData(transposeData, offset);
        pool.freeType(transposeData);
      } else {
        check$1.raise('invalid data for buffer subdata');
      }
      return reglBuffer
    }

    if (!deferInit) {
      reglBuffer(options);
    }

    reglBuffer._reglType = 'buffer';
    reglBuffer._buffer = buffer;
    reglBuffer.subdata = subdata;
    if (config.profile) {
      reglBuffer.stats = buffer.stats;
    }
    reglBuffer.destroy = function () { destroy(buffer); };

    return reglBuffer
  }

  function restoreBuffers () {
    values(bufferSet).forEach(function (buffer) {
      buffer.buffer = gl.createBuffer();
      gl.bindBuffer(buffer.type, buffer.buffer);
      gl.bufferData(
        buffer.type, buffer.persistentData || buffer.byteLength, buffer.usage);
    });
  }

  if (config.profile) {
    stats.getTotalBufferSize = function () {
      var total = 0;
      // TODO: Right now, the streams are not part of the total count.
      Object.keys(bufferSet).forEach(function (key) {
        total += bufferSet[key].stats.size;
      });
      return total
    };
  }

  return {
    create: createBuffer,

    createStream: createStream,
    destroyStream: destroyStream,

    clear: function () {
      values(bufferSet).forEach(destroy);
      streamPool.forEach(destroy);
    },

    getBuffer: function (wrapper) {
      if (wrapper && wrapper._buffer instanceof REGLBuffer) {
        return wrapper._buffer
      }
      return null
    },

    restore: restoreBuffers,

    _initBuffer: initBufferFromData
  }
}

var points = 0;
var point = 0;
var lines = 1;
var line = 1;
var triangles = 4;
var triangle = 4;
var primTypes = {
	points: points,
	point: point,
	lines: lines,
	line: line,
	triangles: triangles,
	triangle: triangle,
	"line loop": 2,
	"line strip": 3,
	"triangle strip": 5,
	"triangle fan": 6
};

var GL_POINTS = 0;
var GL_LINES = 1;
var GL_TRIANGLES = 4;

var GL_BYTE$2 = 5120;
var GL_UNSIGNED_BYTE$4 = 5121;
var GL_SHORT$2 = 5122;
var GL_UNSIGNED_SHORT$2 = 5123;
var GL_INT$2 = 5124;
var GL_UNSIGNED_INT$2 = 5125;

var GL_ELEMENT_ARRAY_BUFFER = 34963;

var GL_STREAM_DRAW$1 = 0x88E0;
var GL_STATIC_DRAW$1 = 0x88E4;

function wrapElementsState (gl, extensions, bufferState, stats) {
  var elementSet = {};
  var elementCount = 0;

  var elementTypes = {
    'uint8': GL_UNSIGNED_BYTE$4,
    'uint16': GL_UNSIGNED_SHORT$2
  };

  if (extensions.oes_element_index_uint) {
    elementTypes.uint32 = GL_UNSIGNED_INT$2;
  }

  function REGLElementBuffer (buffer) {
    this.id = elementCount++;
    elementSet[this.id] = this;
    this.buffer = buffer;
    this.primType = GL_TRIANGLES;
    this.vertCount = 0;
    this.type = 0;
  }

  REGLElementBuffer.prototype.bind = function () {
    this.buffer.bind();
  };

  var bufferPool = [];

  function createElementStream (data) {
    var result = bufferPool.pop();
    if (!result) {
      result = new REGLElementBuffer(bufferState.create(
        null,
        GL_ELEMENT_ARRAY_BUFFER,
        true,
        false)._buffer);
    }
    initElements(result, data, GL_STREAM_DRAW$1, -1, -1, 0, 0);
    return result
  }

  function destroyElementStream (elements) {
    bufferPool.push(elements);
  }

  function initElements (
    elements,
    data,
    usage,
    prim,
    count,
    byteLength,
    type) {
    elements.buffer.bind();
    if (data) {
      var predictedType = type;
      if (!type && (
          !isTypedArray(data) ||
         (isNDArrayLike(data) && !isTypedArray(data.data)))) {
        predictedType = extensions.oes_element_index_uint
          ? GL_UNSIGNED_INT$2
          : GL_UNSIGNED_SHORT$2;
      }
      bufferState._initBuffer(
        elements.buffer,
        data,
        usage,
        predictedType,
        3);
    } else {
      gl.bufferData(GL_ELEMENT_ARRAY_BUFFER, byteLength, usage);
      elements.buffer.dtype = dtype || GL_UNSIGNED_BYTE$4;
      elements.buffer.usage = usage;
      elements.buffer.dimension = 3;
      elements.buffer.byteLength = byteLength;
    }

    var dtype = type;
    if (!type) {
      switch (elements.buffer.dtype) {
        case GL_UNSIGNED_BYTE$4:
        case GL_BYTE$2:
          dtype = GL_UNSIGNED_BYTE$4;
          break

        case GL_UNSIGNED_SHORT$2:
        case GL_SHORT$2:
          dtype = GL_UNSIGNED_SHORT$2;
          break

        case GL_UNSIGNED_INT$2:
        case GL_INT$2:
          dtype = GL_UNSIGNED_INT$2;
          break

        default:
          check$1.raise('unsupported type for element array');
      }
      elements.buffer.dtype = dtype;
    }
    elements.type = dtype;

    // Check oes_element_index_uint extension
    check$1(
      dtype !== GL_UNSIGNED_INT$2 ||
      !!extensions.oes_element_index_uint,
      '32 bit element buffers not supported, enable oes_element_index_uint first');

    // try to guess default primitive type and arguments
    var vertCount = count;
    if (vertCount < 0) {
      vertCount = elements.buffer.byteLength;
      if (dtype === GL_UNSIGNED_SHORT$2) {
        vertCount >>= 1;
      } else if (dtype === GL_UNSIGNED_INT$2) {
        vertCount >>= 2;
      }
    }
    elements.vertCount = vertCount;

    // try to guess primitive type from cell dimension
    var primType = prim;
    if (prim < 0) {
      primType = GL_TRIANGLES;
      var dimension = elements.buffer.dimension;
      if (dimension === 1) primType = GL_POINTS;
      if (dimension === 2) primType = GL_LINES;
      if (dimension === 3) primType = GL_TRIANGLES;
    }
    elements.primType = primType;
  }

  function destroyElements (elements) {
    stats.elementsCount--;

    check$1(elements.buffer !== null, 'must not double destroy elements');
    delete elementSet[elements.id];
    elements.buffer.destroy();
    elements.buffer = null;
  }

  function createElements (options, persistent) {
    var buffer = bufferState.create(null, GL_ELEMENT_ARRAY_BUFFER, true);
    var elements = new REGLElementBuffer(buffer._buffer);
    stats.elementsCount++;

    function reglElements (options) {
      if (!options) {
        buffer();
        elements.primType = GL_TRIANGLES;
        elements.vertCount = 0;
        elements.type = GL_UNSIGNED_BYTE$4;
      } else if (typeof options === 'number') {
        buffer(options);
        elements.primType = GL_TRIANGLES;
        elements.vertCount = options | 0;
        elements.type = GL_UNSIGNED_BYTE$4;
      } else {
        var data = null;
        var usage = GL_STATIC_DRAW$1;
        var primType = -1;
        var vertCount = -1;
        var byteLength = 0;
        var dtype = 0;
        if (Array.isArray(options) ||
            isTypedArray(options) ||
            isNDArrayLike(options)) {
          data = options;
        } else {
          check$1.type(options, 'object', 'invalid arguments for elements');
          if ('data' in options) {
            data = options.data;
            check$1(
                Array.isArray(data) ||
                isTypedArray(data) ||
                isNDArrayLike(data),
                'invalid data for element buffer');
          }
          if ('usage' in options) {
            check$1.parameter(
              options.usage,
              usageTypes,
              'invalid element buffer usage');
            usage = usageTypes[options.usage];
          }
          if ('primitive' in options) {
            check$1.parameter(
              options.primitive,
              primTypes,
              'invalid element buffer primitive');
            primType = primTypes[options.primitive];
          }
          if ('count' in options) {
            check$1(
              typeof options.count === 'number' && options.count >= 0,
              'invalid vertex count for elements');
            vertCount = options.count | 0;
          }
          if ('type' in options) {
            check$1.parameter(
              options.type,
              elementTypes,
              'invalid buffer type');
            dtype = elementTypes[options.type];
          }
          if ('length' in options) {
            byteLength = options.length | 0;
          } else {
            byteLength = vertCount;
            if (dtype === GL_UNSIGNED_SHORT$2 || dtype === GL_SHORT$2) {
              byteLength *= 2;
            } else if (dtype === GL_UNSIGNED_INT$2 || dtype === GL_INT$2) {
              byteLength *= 4;
            }
          }
        }
        initElements(
          elements,
          data,
          usage,
          primType,
          vertCount,
          byteLength,
          dtype);
      }

      return reglElements
    }

    reglElements(options);

    reglElements._reglType = 'elements';
    reglElements._elements = elements;
    reglElements.subdata = function (data, offset) {
      buffer.subdata(data, offset);
      return reglElements
    };
    reglElements.destroy = function () {
      destroyElements(elements);
    };

    return reglElements
  }

  return {
    create: createElements,
    createStream: createElementStream,
    destroyStream: destroyElementStream,
    getElements: function (elements) {
      if (typeof elements === 'function' &&
          elements._elements instanceof REGLElementBuffer) {
        return elements._elements
      }
      return null
    },
    clear: function () {
      values(elementSet).forEach(destroyElements);
    }
  }
}

var FLOAT = new Float32Array(1);
var INT = new Uint32Array(FLOAT.buffer);

var GL_UNSIGNED_SHORT$4 = 5123;

function convertToHalfFloat (array) {
  var ushorts = pool.allocType(GL_UNSIGNED_SHORT$4, array.length);

  for (var i = 0; i < array.length; ++i) {
    if (isNaN(array[i])) {
      ushorts[i] = 0xffff;
    } else if (array[i] === Infinity) {
      ushorts[i] = 0x7c00;
    } else if (array[i] === -Infinity) {
      ushorts[i] = 0xfc00;
    } else {
      FLOAT[0] = array[i];
      var x = INT[0];

      var sgn = (x >>> 31) << 15;
      var exp = ((x << 1) >>> 24) - 127;
      var frac = (x >> 13) & ((1 << 10) - 1);

      if (exp < -24) {
        // round non-representable denormals to 0
        ushorts[i] = sgn;
      } else if (exp < -14) {
        // handle denormals
        var s = -14 - exp;
        ushorts[i] = sgn + ((frac + (1 << 10)) >> s);
      } else if (exp > 15) {
        // round overflow to +/- Infinity
        ushorts[i] = sgn + 0x7c00;
      } else {
        // otherwise convert directly
        ushorts[i] = sgn + ((exp + 15) << 10) + frac;
      }
    }
  }

  return ushorts
}

function isArrayLike (s) {
  return Array.isArray(s) || isTypedArray(s)
}

var isPow2$1 = function (v) {
  return !(v & (v - 1)) && (!!v)
};

var GL_COMPRESSED_TEXTURE_FORMATS = 0x86A3;

var GL_TEXTURE_2D$1 = 0x0DE1;
var GL_TEXTURE_CUBE_MAP$1 = 0x8513;
var GL_TEXTURE_CUBE_MAP_POSITIVE_X$1 = 0x8515;

var GL_RGBA$1 = 0x1908;
var GL_ALPHA = 0x1906;
var GL_RGB = 0x1907;
var GL_LUMINANCE = 0x1909;
var GL_LUMINANCE_ALPHA = 0x190A;

var GL_RGBA4 = 0x8056;
var GL_RGB5_A1 = 0x8057;
var GL_RGB565 = 0x8D62;

var GL_UNSIGNED_SHORT_4_4_4_4$1 = 0x8033;
var GL_UNSIGNED_SHORT_5_5_5_1$1 = 0x8034;
var GL_UNSIGNED_SHORT_5_6_5$1 = 0x8363;
var GL_UNSIGNED_INT_24_8_WEBGL$1 = 0x84FA;

var GL_DEPTH_COMPONENT = 0x1902;
var GL_DEPTH_STENCIL = 0x84F9;

var GL_SRGB_EXT = 0x8C40;
var GL_SRGB_ALPHA_EXT = 0x8C42;

var GL_HALF_FLOAT_OES$1 = 0x8D61;

var GL_COMPRESSED_RGB_S3TC_DXT1_EXT = 0x83F0;
var GL_COMPRESSED_RGBA_S3TC_DXT1_EXT = 0x83F1;
var GL_COMPRESSED_RGBA_S3TC_DXT3_EXT = 0x83F2;
var GL_COMPRESSED_RGBA_S3TC_DXT5_EXT = 0x83F3;

var GL_COMPRESSED_RGB_ATC_WEBGL = 0x8C92;
var GL_COMPRESSED_RGBA_ATC_EXPLICIT_ALPHA_WEBGL = 0x8C93;
var GL_COMPRESSED_RGBA_ATC_INTERPOLATED_ALPHA_WEBGL = 0x87EE;

var GL_COMPRESSED_RGB_PVRTC_4BPPV1_IMG = 0x8C00;
var GL_COMPRESSED_RGB_PVRTC_2BPPV1_IMG = 0x8C01;
var GL_COMPRESSED_RGBA_PVRTC_4BPPV1_IMG = 0x8C02;
var GL_COMPRESSED_RGBA_PVRTC_2BPPV1_IMG = 0x8C03;

var GL_COMPRESSED_RGB_ETC1_WEBGL = 0x8D64;

var GL_UNSIGNED_BYTE$5 = 0x1401;
var GL_UNSIGNED_SHORT$3 = 0x1403;
var GL_UNSIGNED_INT$3 = 0x1405;
var GL_FLOAT$4 = 0x1406;

var GL_TEXTURE_WRAP_S = 0x2802;
var GL_TEXTURE_WRAP_T = 0x2803;

var GL_REPEAT = 0x2901;
var GL_CLAMP_TO_EDGE$1 = 0x812F;
var GL_MIRRORED_REPEAT = 0x8370;

var GL_TEXTURE_MAG_FILTER = 0x2800;
var GL_TEXTURE_MIN_FILTER = 0x2801;

var GL_NEAREST$1 = 0x2600;
var GL_LINEAR = 0x2601;
var GL_NEAREST_MIPMAP_NEAREST$1 = 0x2700;
var GL_LINEAR_MIPMAP_NEAREST$1 = 0x2701;
var GL_NEAREST_MIPMAP_LINEAR$1 = 0x2702;
var GL_LINEAR_MIPMAP_LINEAR$1 = 0x2703;

var GL_GENERATE_MIPMAP_HINT = 0x8192;
var GL_DONT_CARE = 0x1100;
var GL_FASTEST = 0x1101;
var GL_NICEST = 0x1102;

var GL_TEXTURE_MAX_ANISOTROPY_EXT = 0x84FE;

var GL_UNPACK_ALIGNMENT = 0x0CF5;
var GL_UNPACK_FLIP_Y_WEBGL = 0x9240;
var GL_UNPACK_PREMULTIPLY_ALPHA_WEBGL = 0x9241;
var GL_UNPACK_COLORSPACE_CONVERSION_WEBGL = 0x9243;

var GL_BROWSER_DEFAULT_WEBGL = 0x9244;

var GL_TEXTURE0$1 = 0x84C0;

var MIPMAP_FILTERS = [
  GL_NEAREST_MIPMAP_NEAREST$1,
  GL_NEAREST_MIPMAP_LINEAR$1,
  GL_LINEAR_MIPMAP_NEAREST$1,
  GL_LINEAR_MIPMAP_LINEAR$1
];

var CHANNELS_FORMAT = [
  0,
  GL_LUMINANCE,
  GL_LUMINANCE_ALPHA,
  GL_RGB,
  GL_RGBA$1
];

var FORMAT_CHANNELS = {};
FORMAT_CHANNELS[GL_LUMINANCE] =
FORMAT_CHANNELS[GL_ALPHA] =
FORMAT_CHANNELS[GL_DEPTH_COMPONENT] = 1;
FORMAT_CHANNELS[GL_DEPTH_STENCIL] =
FORMAT_CHANNELS[GL_LUMINANCE_ALPHA] = 2;
FORMAT_CHANNELS[GL_RGB] =
FORMAT_CHANNELS[GL_SRGB_EXT] = 3;
FORMAT_CHANNELS[GL_RGBA$1] =
FORMAT_CHANNELS[GL_SRGB_ALPHA_EXT] = 4;

function objectName (str) {
  return '[object ' + str + ']'
}

var CANVAS_CLASS = objectName('HTMLCanvasElement');
var CONTEXT2D_CLASS = objectName('CanvasRenderingContext2D');
var BITMAP_CLASS = objectName('ImageBitmap');
var IMAGE_CLASS = objectName('HTMLImageElement');
var VIDEO_CLASS = objectName('HTMLVideoElement');

var PIXEL_CLASSES = Object.keys(arrayTypes).concat([
  CANVAS_CLASS,
  CONTEXT2D_CLASS,
  BITMAP_CLASS,
  IMAGE_CLASS,
  VIDEO_CLASS
]);

// for every texture type, store
// the size in bytes.
var TYPE_SIZES = [];
TYPE_SIZES[GL_UNSIGNED_BYTE$5] = 1;
TYPE_SIZES[GL_FLOAT$4] = 4;
TYPE_SIZES[GL_HALF_FLOAT_OES$1] = 2;

TYPE_SIZES[GL_UNSIGNED_SHORT$3] = 2;
TYPE_SIZES[GL_UNSIGNED_INT$3] = 4;

var FORMAT_SIZES_SPECIAL = [];
FORMAT_SIZES_SPECIAL[GL_RGBA4] = 2;
FORMAT_SIZES_SPECIAL[GL_RGB5_A1] = 2;
FORMAT_SIZES_SPECIAL[GL_RGB565] = 2;
FORMAT_SIZES_SPECIAL[GL_DEPTH_STENCIL] = 4;

FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGB_S3TC_DXT1_EXT] = 0.5;
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGBA_S3TC_DXT1_EXT] = 0.5;
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGBA_S3TC_DXT3_EXT] = 1;
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGBA_S3TC_DXT5_EXT] = 1;

FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGB_ATC_WEBGL] = 0.5;
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGBA_ATC_EXPLICIT_ALPHA_WEBGL] = 1;
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGBA_ATC_INTERPOLATED_ALPHA_WEBGL] = 1;

FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGB_PVRTC_4BPPV1_IMG] = 0.5;
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGB_PVRTC_2BPPV1_IMG] = 0.25;
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGBA_PVRTC_4BPPV1_IMG] = 0.5;
FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGBA_PVRTC_2BPPV1_IMG] = 0.25;

FORMAT_SIZES_SPECIAL[GL_COMPRESSED_RGB_ETC1_WEBGL] = 0.5;

function isNumericArray (arr) {
  return (
    Array.isArray(arr) &&
    (arr.length === 0 ||
    typeof arr[0] === 'number'))
}

function isRectArray (arr) {
  if (!Array.isArray(arr)) {
    return false
  }
  var width = arr.length;
  if (width === 0 || !isArrayLike(arr[0])) {
    return false
  }
  return true
}

function classString (x) {
  return Object.prototype.toString.call(x)
}

function isCanvasElement (object) {
  return classString(object) === CANVAS_CLASS
}

function isContext2D (object) {
  return classString(object) === CONTEXT2D_CLASS
}

function isBitmap (object) {
  return classString(object) === BITMAP_CLASS
}

function isImageElement (object) {
  return classString(object) === IMAGE_CLASS
}

function isVideoElement (object) {
  return classString(object) === VIDEO_CLASS
}

function isPixelData (object) {
  if (!object) {
    return false
  }
  var className = classString(object);
  if (PIXEL_CLASSES.indexOf(className) >= 0) {
    return true
  }
  return (
    isNumericArray(object) ||
    isRectArray(object) ||
    isNDArrayLike(object))
}

function typedArrayCode$1 (data) {
  return arrayTypes[Object.prototype.toString.call(data)] | 0
}

function convertData (result, data) {
  var n = data.length;
  switch (result.type) {
    case GL_UNSIGNED_BYTE$5:
    case GL_UNSIGNED_SHORT$3:
    case GL_UNSIGNED_INT$3:
    case GL_FLOAT$4:
      var converted = pool.allocType(result.type, n);
      converted.set(data);
      result.data = converted;
      break

    case GL_HALF_FLOAT_OES$1:
      result.data = convertToHalfFloat(data);
      break

    default:
      check$1.raise('unsupported texture type, must specify a typed array');
  }
}

function preConvert (image, n) {
  return pool.allocType(
    image.type === GL_HALF_FLOAT_OES$1
      ? GL_FLOAT$4
      : image.type, n)
}

function postConvert (image, data) {
  if (image.type === GL_HALF_FLOAT_OES$1) {
    image.data = convertToHalfFloat(data);
    pool.freeType(data);
  } else {
    image.data = data;
  }
}

function transposeData (image, array, strideX, strideY, strideC, offset) {
  var w = image.width;
  var h = image.height;
  var c = image.channels;
  var n = w * h * c;
  var data = preConvert(image, n);

  var p = 0;
  for (var i = 0; i < h; ++i) {
    for (var j = 0; j < w; ++j) {
      for (var k = 0; k < c; ++k) {
        data[p++] = array[strideX * j + strideY * i + strideC * k + offset];
      }
    }
  }

  postConvert(image, data);
}

function getTextureSize (format, type, width, height, isMipmap, isCube) {
  var s;
  if (typeof FORMAT_SIZES_SPECIAL[format] !== 'undefined') {
    // we have a special array for dealing with weird color formats such as RGB5A1
    s = FORMAT_SIZES_SPECIAL[format];
  } else {
    s = FORMAT_CHANNELS[format] * TYPE_SIZES[type];
  }

  if (isCube) {
    s *= 6;
  }

  if (isMipmap) {
    // compute the total size of all the mipmaps.
    var total = 0;

    var w = width;
    while (w >= 1) {
      // we can only use mipmaps on a square image,
      // so we can simply use the width and ignore the height:
      total += s * w * w;
      w /= 2;
    }
    return total
  } else {
    return s * width * height
  }
}

function createTextureSet (
  gl, extensions, limits, reglPoll, contextState, stats, config) {
  // -------------------------------------------------------
  // Initialize constants and parameter tables here
  // -------------------------------------------------------
  var mipmapHint = {
    "don't care": GL_DONT_CARE,
    'dont care': GL_DONT_CARE,
    'nice': GL_NICEST,
    'fast': GL_FASTEST
  };

  var wrapModes = {
    'repeat': GL_REPEAT,
    'clamp': GL_CLAMP_TO_EDGE$1,
    'mirror': GL_MIRRORED_REPEAT
  };

  var magFilters = {
    'nearest': GL_NEAREST$1,
    'linear': GL_LINEAR
  };

  var minFilters = extend({
    'mipmap': GL_LINEAR_MIPMAP_LINEAR$1,
    'nearest mipmap nearest': GL_NEAREST_MIPMAP_NEAREST$1,
    'linear mipmap nearest': GL_LINEAR_MIPMAP_NEAREST$1,
    'nearest mipmap linear': GL_NEAREST_MIPMAP_LINEAR$1,
    'linear mipmap linear': GL_LINEAR_MIPMAP_LINEAR$1
  }, magFilters);

  var colorSpace = {
    'none': 0,
    'browser': GL_BROWSER_DEFAULT_WEBGL
  };

  var textureTypes = {
    'uint8': GL_UNSIGNED_BYTE$5,
    'rgba4': GL_UNSIGNED_SHORT_4_4_4_4$1,
    'rgb565': GL_UNSIGNED_SHORT_5_6_5$1,
    'rgb5 a1': GL_UNSIGNED_SHORT_5_5_5_1$1
  };

  var textureFormats = {
    'alpha': GL_ALPHA,
    'luminance': GL_LUMINANCE,
    'luminance alpha': GL_LUMINANCE_ALPHA,
    'rgb': GL_RGB,
    'rgba': GL_RGBA$1,
    'rgba4': GL_RGBA4,
    'rgb5 a1': GL_RGB5_A1,
    'rgb565': GL_RGB565
  };

  var compressedTextureFormats = {};

  if (extensions.ext_srgb) {
    textureFormats.srgb = GL_SRGB_EXT;
    textureFormats.srgba = GL_SRGB_ALPHA_EXT;
  }

  if (extensions.oes_texture_float) {
    textureTypes.float32 = textureTypes.float = GL_FLOAT$4;
  }

  if (extensions.oes_texture_half_float) {
    textureTypes['float16'] = textureTypes['half float'] = GL_HALF_FLOAT_OES$1;
  }

  if (extensions.webgl_depth_texture) {
    extend(textureFormats, {
      'depth': GL_DEPTH_COMPONENT,
      'depth stencil': GL_DEPTH_STENCIL
    });

    extend(textureTypes, {
      'uint16': GL_UNSIGNED_SHORT$3,
      'uint32': GL_UNSIGNED_INT$3,
      'depth stencil': GL_UNSIGNED_INT_24_8_WEBGL$1
    });
  }

  if (extensions.webgl_compressed_texture_s3tc) {
    extend(compressedTextureFormats, {
      'rgb s3tc dxt1': GL_COMPRESSED_RGB_S3TC_DXT1_EXT,
      'rgba s3tc dxt1': GL_COMPRESSED_RGBA_S3TC_DXT1_EXT,
      'rgba s3tc dxt3': GL_COMPRESSED_RGBA_S3TC_DXT3_EXT,
      'rgba s3tc dxt5': GL_COMPRESSED_RGBA_S3TC_DXT5_EXT
    });
  }

  if (extensions.webgl_compressed_texture_atc) {
    extend(compressedTextureFormats, {
      'rgb atc': GL_COMPRESSED_RGB_ATC_WEBGL,
      'rgba atc explicit alpha': GL_COMPRESSED_RGBA_ATC_EXPLICIT_ALPHA_WEBGL,
      'rgba atc interpolated alpha': GL_COMPRESSED_RGBA_ATC_INTERPOLATED_ALPHA_WEBGL
    });
  }

  if (extensions.webgl_compressed_texture_pvrtc) {
    extend(compressedTextureFormats, {
      'rgb pvrtc 4bppv1': GL_COMPRESSED_RGB_PVRTC_4BPPV1_IMG,
      'rgb pvrtc 2bppv1': GL_COMPRESSED_RGB_PVRTC_2BPPV1_IMG,
      'rgba pvrtc 4bppv1': GL_COMPRESSED_RGBA_PVRTC_4BPPV1_IMG,
      'rgba pvrtc 2bppv1': GL_COMPRESSED_RGBA_PVRTC_2BPPV1_IMG
    });
  }

  if (extensions.webgl_compressed_texture_etc1) {
    compressedTextureFormats['rgb etc1'] = GL_COMPRESSED_RGB_ETC1_WEBGL;
  }

  // Copy over all texture formats
  var supportedCompressedFormats = Array.prototype.slice.call(
    gl.getParameter(GL_COMPRESSED_TEXTURE_FORMATS));
  Object.keys(compressedTextureFormats).forEach(function (name) {
    var format = compressedTextureFormats[name];
    if (supportedCompressedFormats.indexOf(format) >= 0) {
      textureFormats[name] = format;
    }
  });

  var supportedFormats = Object.keys(textureFormats);
  limits.textureFormats = supportedFormats;

  // associate with every format string its
  // corresponding GL-value.
  var textureFormatsInvert = [];
  Object.keys(textureFormats).forEach(function (key) {
    var val = textureFormats[key];
    textureFormatsInvert[val] = key;
  });

  // associate with every type string its
  // corresponding GL-value.
  var textureTypesInvert = [];
  Object.keys(textureTypes).forEach(function (key) {
    var val = textureTypes[key];
    textureTypesInvert[val] = key;
  });

  var magFiltersInvert = [];
  Object.keys(magFilters).forEach(function (key) {
    var val = magFilters[key];
    magFiltersInvert[val] = key;
  });

  var minFiltersInvert = [];
  Object.keys(minFilters).forEach(function (key) {
    var val = minFilters[key];
    minFiltersInvert[val] = key;
  });

  var wrapModesInvert = [];
  Object.keys(wrapModes).forEach(function (key) {
    var val = wrapModes[key];
    wrapModesInvert[val] = key;
  });

  // colorFormats[] gives the format (channels) associated to an
  // internalformat
  var colorFormats = supportedFormats.reduce(function (color, key) {
    var glenum = textureFormats[key];
    if (glenum === GL_LUMINANCE ||
        glenum === GL_ALPHA ||
        glenum === GL_LUMINANCE ||
        glenum === GL_LUMINANCE_ALPHA ||
        glenum === GL_DEPTH_COMPONENT ||
        glenum === GL_DEPTH_STENCIL) {
      color[glenum] = glenum;
    } else if (glenum === GL_RGB5_A1 || key.indexOf('rgba') >= 0) {
      color[glenum] = GL_RGBA$1;
    } else {
      color[glenum] = GL_RGB;
    }
    return color
  }, {});

  function TexFlags () {
    // format info
    this.internalformat = GL_RGBA$1;
    this.format = GL_RGBA$1;
    this.type = GL_UNSIGNED_BYTE$5;
    this.compressed = false;

    // pixel storage
    this.premultiplyAlpha = false;
    this.flipY = false;
    this.unpackAlignment = 1;
    this.colorSpace = GL_BROWSER_DEFAULT_WEBGL;

    // shape info
    this.width = 0;
    this.height = 0;
    this.channels = 0;
  }

  function copyFlags (result, other) {
    result.internalformat = other.internalformat;
    result.format = other.format;
    result.type = other.type;
    result.compressed = other.compressed;

    result.premultiplyAlpha = other.premultiplyAlpha;
    result.flipY = other.flipY;
    result.unpackAlignment = other.unpackAlignment;
    result.colorSpace = other.colorSpace;

    result.width = other.width;
    result.height = other.height;
    result.channels = other.channels;
  }

  function parseFlags (flags, options) {
    if (typeof options !== 'object' || !options) {
      return
    }

    if ('premultiplyAlpha' in options) {
      check$1.type(options.premultiplyAlpha, 'boolean',
        'invalid premultiplyAlpha');
      flags.premultiplyAlpha = options.premultiplyAlpha;
    }

    if ('flipY' in options) {
      check$1.type(options.flipY, 'boolean',
        'invalid texture flip');
      flags.flipY = options.flipY;
    }

    if ('alignment' in options) {
      check$1.oneOf(options.alignment, [1, 2, 4, 8],
        'invalid texture unpack alignment');
      flags.unpackAlignment = options.alignment;
    }

    if ('colorSpace' in options) {
      check$1.parameter(options.colorSpace, colorSpace,
        'invalid colorSpace');
      flags.colorSpace = colorSpace[options.colorSpace];
    }

    if ('type' in options) {
      var type = options.type;
      check$1(extensions.oes_texture_float ||
        !(type === 'float' || type === 'float32'),
        'you must enable the OES_texture_float extension in order to use floating point textures.');
      check$1(extensions.oes_texture_half_float ||
        !(type === 'half float' || type === 'float16'),
        'you must enable the OES_texture_half_float extension in order to use 16-bit floating point textures.');
      check$1(extensions.webgl_depth_texture ||
        !(type === 'uint16' || type === 'uint32' || type === 'depth stencil'),
        'you must enable the WEBGL_depth_texture extension in order to use depth/stencil textures.');
      check$1.parameter(type, textureTypes,
        'invalid texture type');
      flags.type = textureTypes[type];
    }

    var w = flags.width;
    var h = flags.height;
    var c = flags.channels;
    var hasChannels = false;
    if ('shape' in options) {
      check$1(Array.isArray(options.shape) && options.shape.length >= 2,
        'shape must be an array');
      w = options.shape[0];
      h = options.shape[1];
      if (options.shape.length === 3) {
        c = options.shape[2];
        check$1(c > 0 && c <= 4, 'invalid number of channels');
        hasChannels = true;
      }
      check$1(w >= 0 && w <= limits.maxTextureSize, 'invalid width');
      check$1(h >= 0 && h <= limits.maxTextureSize, 'invalid height');
    } else {
      if ('radius' in options) {
        w = h = options.radius;
        check$1(w >= 0 && w <= limits.maxTextureSize, 'invalid radius');
      }
      if ('width' in options) {
        w = options.width;
        check$1(w >= 0 && w <= limits.maxTextureSize, 'invalid width');
      }
      if ('height' in options) {
        h = options.height;
        check$1(h >= 0 && h <= limits.maxTextureSize, 'invalid height');
      }
      if ('channels' in options) {
        c = options.channels;
        check$1(c > 0 && c <= 4, 'invalid number of channels');
        hasChannels = true;
      }
    }
    flags.width = w | 0;
    flags.height = h | 0;
    flags.channels = c | 0;

    var hasFormat = false;
    if ('format' in options) {
      var formatStr = options.format;
      check$1(extensions.webgl_depth_texture ||
        !(formatStr === 'depth' || formatStr === 'depth stencil'),
        'you must enable the WEBGL_depth_texture extension in order to use depth/stencil textures.');
      check$1.parameter(formatStr, textureFormats,
        'invalid texture format');
      var internalformat = flags.internalformat = textureFormats[formatStr];
      flags.format = colorFormats[internalformat];
      if (formatStr in textureTypes) {
        if (!('type' in options)) {
          flags.type = textureTypes[formatStr];
        }
      }
      if (formatStr in compressedTextureFormats) {
        flags.compressed = true;
      }
      hasFormat = true;
    }

    // Reconcile channels and format
    if (!hasChannels && hasFormat) {
      flags.channels = FORMAT_CHANNELS[flags.format];
    } else if (hasChannels && !hasFormat) {
      if (flags.channels !== CHANNELS_FORMAT[flags.format]) {
        flags.format = flags.internalformat = CHANNELS_FORMAT[flags.channels];
      }
    } else if (hasFormat && hasChannels) {
      check$1(
        flags.channels === FORMAT_CHANNELS[flags.format],
        'number of channels inconsistent with specified format');
    }
  }

  function setFlags (flags) {
    gl.pixelStorei(GL_UNPACK_FLIP_Y_WEBGL, flags.flipY);
    gl.pixelStorei(GL_UNPACK_PREMULTIPLY_ALPHA_WEBGL, flags.premultiplyAlpha);
    gl.pixelStorei(GL_UNPACK_COLORSPACE_CONVERSION_WEBGL, flags.colorSpace);
    gl.pixelStorei(GL_UNPACK_ALIGNMENT, flags.unpackAlignment);
  }

  // -------------------------------------------------------
  // Tex image data
  // -------------------------------------------------------
  function TexImage () {
    TexFlags.call(this);

    this.xOffset = 0;
    this.yOffset = 0;

    // data
    this.data = null;
    this.needsFree = false;

    // html element
    this.element = null;

    // copyTexImage info
    this.needsCopy = false;
  }

  function parseImage (image, options) {
    var data = null;
    if (isPixelData(options)) {
      data = options;
    } else if (options) {
      check$1.type(options, 'object', 'invalid pixel data type');
      parseFlags(image, options);
      if ('x' in options) {
        image.xOffset = options.x | 0;
      }
      if ('y' in options) {
        image.yOffset = options.y | 0;
      }
      if (isPixelData(options.data)) {
        data = options.data;
      }
    }

    check$1(
      !image.compressed ||
      data instanceof Uint8Array,
      'compressed texture data must be stored in a uint8array');

    if (options.copy) {
      check$1(!data, 'can not specify copy and data field for the same texture');
      var viewW = contextState.viewportWidth;
      var viewH = contextState.viewportHeight;
      image.width = image.width || (viewW - image.xOffset);
      image.height = image.height || (viewH - image.yOffset);
      image.needsCopy = true;
      check$1(image.xOffset >= 0 && image.xOffset < viewW &&
            image.yOffset >= 0 && image.yOffset < viewH &&
            image.width > 0 && image.width <= viewW &&
            image.height > 0 && image.height <= viewH,
            'copy texture read out of bounds');
    } else if (!data) {
      image.width = image.width || 1;
      image.height = image.height || 1;
      image.channels = image.channels || 4;
    } else if (isTypedArray(data)) {
      image.channels = image.channels || 4;
      image.data = data;
      if (!('type' in options) && image.type === GL_UNSIGNED_BYTE$5) {
        image.type = typedArrayCode$1(data);
      }
    } else if (isNumericArray(data)) {
      image.channels = image.channels || 4;
      convertData(image, data);
      image.alignment = 1;
      image.needsFree = true;
    } else if (isNDArrayLike(data)) {
      var array = data.data;
      if (!Array.isArray(array) && image.type === GL_UNSIGNED_BYTE$5) {
        image.type = typedArrayCode$1(array);
      }
      var shape = data.shape;
      var stride = data.stride;
      var shapeX, shapeY, shapeC, strideX, strideY, strideC;
      if (shape.length === 3) {
        shapeC = shape[2];
        strideC = stride[2];
      } else {
        check$1(shape.length === 2, 'invalid ndarray pixel data, must be 2 or 3D');
        shapeC = 1;
        strideC = 1;
      }
      shapeX = shape[0];
      shapeY = shape[1];
      strideX = stride[0];
      strideY = stride[1];
      image.alignment = 1;
      image.width = shapeX;
      image.height = shapeY;
      image.channels = shapeC;
      image.format = image.internalformat = CHANNELS_FORMAT[shapeC];
      image.needsFree = true;
      transposeData(image, array, strideX, strideY, strideC, data.offset);
    } else if (isCanvasElement(data) || isContext2D(data)) {
      if (isCanvasElement(data)) {
        image.element = data;
      } else {
        image.element = data.canvas;
      }
      image.width = image.element.width;
      image.height = image.element.height;
      image.channels = 4;
    } else if (isBitmap(data)) {
      image.element = data;
      image.width = data.width;
      image.height = data.height;
      image.channels = 4;
    } else if (isImageElement(data)) {
      image.element = data;
      image.width = data.naturalWidth;
      image.height = data.naturalHeight;
      image.channels = 4;
    } else if (isVideoElement(data)) {
      image.element = data;
      image.width = data.videoWidth;
      image.height = data.videoHeight;
      image.channels = 4;
    } else if (isRectArray(data)) {
      var w = image.width || data[0].length;
      var h = image.height || data.length;
      var c = image.channels;
      if (isArrayLike(data[0][0])) {
        c = c || data[0][0].length;
      } else {
        c = c || 1;
      }
      var arrayShape = flattenUtils.shape(data);
      var n = 1;
      for (var dd = 0; dd < arrayShape.length; ++dd) {
        n *= arrayShape[dd];
      }
      var allocData = preConvert(image, n);
      flattenUtils.flatten(data, arrayShape, '', allocData);
      postConvert(image, allocData);
      image.alignment = 1;
      image.width = w;
      image.height = h;
      image.channels = c;
      image.format = image.internalformat = CHANNELS_FORMAT[c];
      image.needsFree = true;
    }

    if (image.type === GL_FLOAT$4) {
      check$1(limits.extensions.indexOf('oes_texture_float') >= 0,
        'oes_texture_float extension not enabled');
    } else if (image.type === GL_HALF_FLOAT_OES$1) {
      check$1(limits.extensions.indexOf('oes_texture_half_float') >= 0,
        'oes_texture_half_float extension not enabled');
    }

    // do compressed texture  validation here.
  }

  function setImage (info, target, miplevel) {
    var element = info.element;
    var data = info.data;
    var internalformat = info.internalformat;
    var format = info.format;
    var type = info.type;
    var width = info.width;
    var height = info.height;
    var channels = info.channels;

    setFlags(info);

    if (element) {
      gl.texImage2D(target, miplevel, format, format, type, element);
    } else if (info.compressed) {
      gl.compressedTexImage2D(target, miplevel, internalformat, width, height, 0, data);
    } else if (info.needsCopy) {
      reglPoll();
      gl.copyTexImage2D(
        target, miplevel, format, info.xOffset, info.yOffset, width, height, 0);
    } else {
      var nullData = !data;
      if (nullData) {
        data = pool.zero.allocType(type, width * height * channels);
      }

      gl.texImage2D(target, miplevel, format, width, height, 0, format, type, data);

      if (nullData && data) {
        pool.zero.freeType(data);
      }
    }
  }

  function setSubImage (info, target, x, y, miplevel) {
    var element = info.element;
    var data = info.data;
    var internalformat = info.internalformat;
    var format = info.format;
    var type = info.type;
    var width = info.width;
    var height = info.height;

    setFlags(info);

    if (element) {
      gl.texSubImage2D(
        target, miplevel, x, y, format, type, element);
    } else if (info.compressed) {
      gl.compressedTexSubImage2D(
        target, miplevel, x, y, internalformat, width, height, data);
    } else if (info.needsCopy) {
      reglPoll();
      gl.copyTexSubImage2D(
        target, miplevel, x, y, info.xOffset, info.yOffset, width, height);
    } else {
      gl.texSubImage2D(
        target, miplevel, x, y, width, height, format, type, data);
    }
  }

  // texImage pool
  var imagePool = [];

  function allocImage () {
    return imagePool.pop() || new TexImage()
  }

  function freeImage (image) {
    if (image.needsFree) {
      pool.freeType(image.data);
    }
    TexImage.call(image);
    imagePool.push(image);
  }

  // -------------------------------------------------------
  // Mip map
  // -------------------------------------------------------
  function MipMap () {
    TexFlags.call(this);

    this.genMipmaps = false;
    this.mipmapHint = GL_DONT_CARE;
    this.mipmask = 0;
    this.images = Array(16);
  }

  function parseMipMapFromShape (mipmap, width, height) {
    var img = mipmap.images[0] = allocImage();
    mipmap.mipmask = 1;
    img.width = mipmap.width = width;
    img.height = mipmap.height = height;
    img.channels = mipmap.channels = 4;
  }

  function parseMipMapFromObject (mipmap, options) {
    var imgData = null;
    if (isPixelData(options)) {
      imgData = mipmap.images[0] = allocImage();
      copyFlags(imgData, mipmap);
      parseImage(imgData, options);
      mipmap.mipmask = 1;
    } else {
      parseFlags(mipmap, options);
      if (Array.isArray(options.mipmap)) {
        var mipData = options.mipmap;
        for (var i = 0; i < mipData.length; ++i) {
          imgData = mipmap.images[i] = allocImage();
          copyFlags(imgData, mipmap);
          imgData.width >>= i;
          imgData.height >>= i;
          parseImage(imgData, mipData[i]);
          mipmap.mipmask |= (1 << i);
        }
      } else {
        imgData = mipmap.images[0] = allocImage();
        copyFlags(imgData, mipmap);
        parseImage(imgData, options);
        mipmap.mipmask = 1;
      }
    }
    copyFlags(mipmap, mipmap.images[0]);

    // For textures of the compressed format WEBGL_compressed_texture_s3tc
    // we must have that
    //
    // "When level equals zero width and height must be a multiple of 4.
    // When level is greater than 0 width and height must be 0, 1, 2 or a multiple of 4. "
    //
    // but we do not yet support having multiple mipmap levels for compressed textures,
    // so we only test for level zero.

    if (mipmap.compressed &&
        (mipmap.internalformat === GL_COMPRESSED_RGB_S3TC_DXT1_EXT) ||
        (mipmap.internalformat === GL_COMPRESSED_RGBA_S3TC_DXT1_EXT) ||
        (mipmap.internalformat === GL_COMPRESSED_RGBA_S3TC_DXT3_EXT) ||
        (mipmap.internalformat === GL_COMPRESSED_RGBA_S3TC_DXT5_EXT)) {
      check$1(mipmap.width % 4 === 0 &&
            mipmap.height % 4 === 0,
            'for compressed texture formats, mipmap level 0 must have width and height that are a multiple of 4');
    }
  }

  function setMipMap (mipmap, target) {
    var images = mipmap.images;
    for (var i = 0; i < images.length; ++i) {
      if (!images[i]) {
        return
      }
      setImage(images[i], target, i);
    }
  }

  var mipPool = [];

  function allocMipMap () {
    var result = mipPool.pop() || new MipMap();
    TexFlags.call(result);
    result.mipmask = 0;
    for (var i = 0; i < 16; ++i) {
      result.images[i] = null;
    }
    return result
  }

  function freeMipMap (mipmap) {
    var images = mipmap.images;
    for (var i = 0; i < images.length; ++i) {
      if (images[i]) {
        freeImage(images[i]);
      }
      images[i] = null;
    }
    mipPool.push(mipmap);
  }

  // -------------------------------------------------------
  // Tex info
  // -------------------------------------------------------
  function TexInfo () {
    this.minFilter = GL_NEAREST$1;
    this.magFilter = GL_NEAREST$1;

    this.wrapS = GL_CLAMP_TO_EDGE$1;
    this.wrapT = GL_CLAMP_TO_EDGE$1;

    this.anisotropic = 1;

    this.genMipmaps = false;
    this.mipmapHint = GL_DONT_CARE;
  }

  function parseTexInfo (info, options) {
    if ('min' in options) {
      var minFilter = options.min;
      check$1.parameter(minFilter, minFilters);
      info.minFilter = minFilters[minFilter];
      if (MIPMAP_FILTERS.indexOf(info.minFilter) >= 0 && !('faces' in options)) {
        info.genMipmaps = true;
      }
    }

    if ('mag' in options) {
      var magFilter = options.mag;
      check$1.parameter(magFilter, magFilters);
      info.magFilter = magFilters[magFilter];
    }

    var wrapS = info.wrapS;
    var wrapT = info.wrapT;
    if ('wrap' in options) {
      var wrap = options.wrap;
      if (typeof wrap === 'string') {
        check$1.parameter(wrap, wrapModes);
        wrapS = wrapT = wrapModes[wrap];
      } else if (Array.isArray(wrap)) {
        check$1.parameter(wrap[0], wrapModes);
        check$1.parameter(wrap[1], wrapModes);
        wrapS = wrapModes[wrap[0]];
        wrapT = wrapModes[wrap[1]];
      }
    } else {
      if ('wrapS' in options) {
        var optWrapS = options.wrapS;
        check$1.parameter(optWrapS, wrapModes);
        wrapS = wrapModes[optWrapS];
      }
      if ('wrapT' in options) {
        var optWrapT = options.wrapT;
        check$1.parameter(optWrapT, wrapModes);
        wrapT = wrapModes[optWrapT];
      }
    }
    info.wrapS = wrapS;
    info.wrapT = wrapT;

    if ('anisotropic' in options) {
      var anisotropic = options.anisotropic;
      check$1(typeof anisotropic === 'number' &&
         anisotropic >= 1 && anisotropic <= limits.maxAnisotropic,
        'aniso samples must be between 1 and ');
      info.anisotropic = options.anisotropic;
    }

    if ('mipmap' in options) {
      var hasMipMap = false;
      switch (typeof options.mipmap) {
        case 'string':
          check$1.parameter(options.mipmap, mipmapHint,
            'invalid mipmap hint');
          info.mipmapHint = mipmapHint[options.mipmap];
          info.genMipmaps = true;
          hasMipMap = true;
          break

        case 'boolean':
          hasMipMap = info.genMipmaps = options.mipmap;
          break

        case 'object':
          check$1(Array.isArray(options.mipmap), 'invalid mipmap type');
          info.genMipmaps = false;
          hasMipMap = true;
          break

        default:
          check$1.raise('invalid mipmap type');
      }
      if (hasMipMap && !('min' in options)) {
        info.minFilter = GL_NEAREST_MIPMAP_NEAREST$1;
      }
    }
  }

  function setTexInfo (info, target) {
    gl.texParameteri(target, GL_TEXTURE_MIN_FILTER, info.minFilter);
    gl.texParameteri(target, GL_TEXTURE_MAG_FILTER, info.magFilter);
    gl.texParameteri(target, GL_TEXTURE_WRAP_S, info.wrapS);
    gl.texParameteri(target, GL_TEXTURE_WRAP_T, info.wrapT);
    if (extensions.ext_texture_filter_anisotropic) {
      gl.texParameteri(target, GL_TEXTURE_MAX_ANISOTROPY_EXT, info.anisotropic);
    }
    if (info.genMipmaps) {
      gl.hint(GL_GENERATE_MIPMAP_HINT, info.mipmapHint);
      gl.generateMipmap(target);
    }
  }

  // -------------------------------------------------------
  // Full texture object
  // -------------------------------------------------------
  var textureCount = 0;
  var textureSet = {};
  var numTexUnits = limits.maxTextureUnits;
  var textureUnits = Array(numTexUnits).map(function () {
    return null
  });

  function REGLTexture (target) {
    TexFlags.call(this);
    this.mipmask = 0;
    this.internalformat = GL_RGBA$1;

    this.id = textureCount++;

    this.refCount = 1;

    this.target = target;
    this.texture = gl.createTexture();

    this.unit = -1;
    this.bindCount = 0;

    this.texInfo = new TexInfo();

    if (config.profile) {
      this.stats = {size: 0};
    }
  }

  function tempBind (texture) {
    gl.activeTexture(GL_TEXTURE0$1);
    gl.bindTexture(texture.target, texture.texture);
  }

  function tempRestore () {
    var prev = textureUnits[0];
    if (prev) {
      gl.bindTexture(prev.target, prev.texture);
    } else {
      gl.bindTexture(GL_TEXTURE_2D$1, null);
    }
  }

  function destroy (texture) {
    var handle = texture.texture;
    check$1(handle, 'must not double destroy texture');
    var unit = texture.unit;
    var target = texture.target;
    if (unit >= 0) {
      gl.activeTexture(GL_TEXTURE0$1 + unit);
      gl.bindTexture(target, null);
      textureUnits[unit] = null;
    }
    gl.deleteTexture(handle);
    texture.texture = null;
    texture.params = null;
    texture.pixels = null;
    texture.refCount = 0;
    delete textureSet[texture.id];
    stats.textureCount--;
  }

  extend(REGLTexture.prototype, {
    bind: function () {
      var texture = this;
      texture.bindCount += 1;
      var unit = texture.unit;
      if (unit < 0) {
        for (var i = 0; i < numTexUnits; ++i) {
          var other = textureUnits[i];
          if (other) {
            if (other.bindCount > 0) {
              continue
            }
            other.unit = -1;
          }
          textureUnits[i] = texture;
          unit = i;
          break
        }
        if (unit >= numTexUnits) {
          check$1.raise('insufficient number of texture units');
        }
        if (config.profile && stats.maxTextureUnits < (unit + 1)) {
          stats.maxTextureUnits = unit + 1; // +1, since the units are zero-based
        }
        texture.unit = unit;
        gl.activeTexture(GL_TEXTURE0$1 + unit);
        gl.bindTexture(texture.target, texture.texture);
      }
      return unit
    },

    unbind: function () {
      this.bindCount -= 1;
    },

    decRef: function () {
      if (--this.refCount <= 0) {
        destroy(this);
      }
    }
  });

  function createTexture2D (a, b) {
    var texture = new REGLTexture(GL_TEXTURE_2D$1);
    textureSet[texture.id] = texture;
    stats.textureCount++;

    function reglTexture2D (a, b) {
      var texInfo = texture.texInfo;
      TexInfo.call(texInfo);
      var mipData = allocMipMap();

      if (typeof a === 'number') {
        if (typeof b === 'number') {
          parseMipMapFromShape(mipData, a | 0, b | 0);
        } else {
          parseMipMapFromShape(mipData, a | 0, a | 0);
        }
      } else if (a) {
        check$1.type(a, 'object', 'invalid arguments to regl.texture');
        parseTexInfo(texInfo, a);
        parseMipMapFromObject(mipData, a);
      } else {
        // empty textures get assigned a default shape of 1x1
        parseMipMapFromShape(mipData, 1, 1);
      }

      if (texInfo.genMipmaps) {
        mipData.mipmask = (mipData.width << 1) - 1;
      }
      texture.mipmask = mipData.mipmask;

      copyFlags(texture, mipData);

      check$1.texture2D(texInfo, mipData, limits);
      texture.internalformat = mipData.internalformat;

      reglTexture2D.width = mipData.width;
      reglTexture2D.height = mipData.height;

      tempBind(texture);
      setMipMap(mipData, GL_TEXTURE_2D$1);
      setTexInfo(texInfo, GL_TEXTURE_2D$1);
      tempRestore();

      freeMipMap(mipData);

      if (config.profile) {
        texture.stats.size = getTextureSize(
          texture.internalformat,
          texture.type,
          mipData.width,
          mipData.height,
          texInfo.genMipmaps,
          false);
      }
      reglTexture2D.format = textureFormatsInvert[texture.internalformat];
      reglTexture2D.type = textureTypesInvert[texture.type];

      reglTexture2D.mag = magFiltersInvert[texInfo.magFilter];
      reglTexture2D.min = minFiltersInvert[texInfo.minFilter];

      reglTexture2D.wrapS = wrapModesInvert[texInfo.wrapS];
      reglTexture2D.wrapT = wrapModesInvert[texInfo.wrapT];

      return reglTexture2D
    }

    function subimage (image, x_, y_, level_) {
      check$1(!!image, 'must specify image data');

      var x = x_ | 0;
      var y = y_ | 0;
      var level = level_ | 0;

      var imageData = allocImage();
      copyFlags(imageData, texture);
      imageData.width = 0;
      imageData.height = 0;
      parseImage(imageData, image);
      imageData.width = imageData.width || ((texture.width >> level) - x);
      imageData.height = imageData.height || ((texture.height >> level) - y);

      check$1(
        texture.type === imageData.type &&
        texture.format === imageData.format &&
        texture.internalformat === imageData.internalformat,
        'incompatible format for texture.subimage');
      check$1(
        x >= 0 && y >= 0 &&
        x + imageData.width <= texture.width &&
        y + imageData.height <= texture.height,
        'texture.subimage write out of bounds');
      check$1(
        texture.mipmask & (1 << level),
        'missing mipmap data');
      check$1(
        imageData.data || imageData.element || imageData.needsCopy,
        'missing image data');

      tempBind(texture);
      setSubImage(imageData, GL_TEXTURE_2D$1, x, y, level);
      tempRestore();

      freeImage(imageData);

      return reglTexture2D
    }

    function resize (w_, h_) {
      var w = w_ | 0;
      var h = (h_ | 0) || w;
      if (w === texture.width && h === texture.height) {
        return reglTexture2D
      }

      reglTexture2D.width = texture.width = w;
      reglTexture2D.height = texture.height = h;

      tempBind(texture);

      var data;
      var channels = texture.channels;
      var type = texture.type;

      for (var i = 0; texture.mipmask >> i; ++i) {
        var _w = w >> i;
        var _h = h >> i;
        if (!_w || !_h) break
        data = pool.zero.allocType(type, _w * _h * channels);
        gl.texImage2D(
          GL_TEXTURE_2D$1,
          i,
          texture.format,
          _w,
          _h,
          0,
          texture.format,
          texture.type,
          data);
        if (data) pool.zero.freeType(data);
      }
      tempRestore();

      // also, recompute the texture size.
      if (config.profile) {
        texture.stats.size = getTextureSize(
          texture.internalformat,
          texture.type,
          w,
          h,
          false,
          false);
      }

      return reglTexture2D
    }

    reglTexture2D(a, b);

    reglTexture2D.subimage = subimage;
    reglTexture2D.resize = resize;
    reglTexture2D._reglType = 'texture2d';
    reglTexture2D._texture = texture;
    if (config.profile) {
      reglTexture2D.stats = texture.stats;
    }
    reglTexture2D.destroy = function () {
      texture.decRef();
    };

    return reglTexture2D
  }

  function createTextureCube (a0, a1, a2, a3, a4, a5) {
    var texture = new REGLTexture(GL_TEXTURE_CUBE_MAP$1);
    textureSet[texture.id] = texture;
    stats.cubeCount++;

    var faces = new Array(6);

    function reglTextureCube (a0, a1, a2, a3, a4, a5) {
      var i;
      var texInfo = texture.texInfo;
      TexInfo.call(texInfo);
      for (i = 0; i < 6; ++i) {
        faces[i] = allocMipMap();
      }

      if (typeof a0 === 'number' || !a0) {
        var s = (a0 | 0) || 1;
        for (i = 0; i < 6; ++i) {
          parseMipMapFromShape(faces[i], s, s);
        }
      } else if (typeof a0 === 'object') {
        if (a1) {
          parseMipMapFromObject(faces[0], a0);
          parseMipMapFromObject(faces[1], a1);
          parseMipMapFromObject(faces[2], a2);
          parseMipMapFromObject(faces[3], a3);
          parseMipMapFromObject(faces[4], a4);
          parseMipMapFromObject(faces[5], a5);
        } else {
          parseTexInfo(texInfo, a0);
          parseFlags(texture, a0);
          if ('faces' in a0) {
            var face_input = a0.faces;
            check$1(Array.isArray(face_input) && face_input.length === 6,
              'cube faces must be a length 6 array');
            for (i = 0; i < 6; ++i) {
              check$1(typeof face_input[i] === 'object' && !!face_input[i],
                'invalid input for cube map face');
              copyFlags(faces[i], texture);
              parseMipMapFromObject(faces[i], face_input[i]);
            }
          } else {
            for (i = 0; i < 6; ++i) {
              parseMipMapFromObject(faces[i], a0);
            }
          }
        }
      } else {
        check$1.raise('invalid arguments to cube map');
      }

      copyFlags(texture, faces[0]);

      if (!limits.npotTextureCube) {
        check$1(isPow2$1(texture.width) && isPow2$1(texture.height), 'your browser does not support non power or two texture dimensions');
      }

      if (texInfo.genMipmaps) {
        texture.mipmask = (faces[0].width << 1) - 1;
      } else {
        texture.mipmask = faces[0].mipmask;
      }

      check$1.textureCube(texture, texInfo, faces, limits);
      texture.internalformat = faces[0].internalformat;

      reglTextureCube.width = faces[0].width;
      reglTextureCube.height = faces[0].height;

      tempBind(texture);
      for (i = 0; i < 6; ++i) {
        setMipMap(faces[i], GL_TEXTURE_CUBE_MAP_POSITIVE_X$1 + i);
      }
      setTexInfo(texInfo, GL_TEXTURE_CUBE_MAP$1);
      tempRestore();

      if (config.profile) {
        texture.stats.size = getTextureSize(
          texture.internalformat,
          texture.type,
          reglTextureCube.width,
          reglTextureCube.height,
          texInfo.genMipmaps,
          true);
      }

      reglTextureCube.format = textureFormatsInvert[texture.internalformat];
      reglTextureCube.type = textureTypesInvert[texture.type];

      reglTextureCube.mag = magFiltersInvert[texInfo.magFilter];
      reglTextureCube.min = minFiltersInvert[texInfo.minFilter];

      reglTextureCube.wrapS = wrapModesInvert[texInfo.wrapS];
      reglTextureCube.wrapT = wrapModesInvert[texInfo.wrapT];

      for (i = 0; i < 6; ++i) {
        freeMipMap(faces[i]);
      }

      return reglTextureCube
    }

    function subimage (face, image, x_, y_, level_) {
      check$1(!!image, 'must specify image data');
      check$1(typeof face === 'number' && face === (face | 0) &&
        face >= 0 && face < 6, 'invalid face');

      var x = x_ | 0;
      var y = y_ | 0;
      var level = level_ | 0;

      var imageData = allocImage();
      copyFlags(imageData, texture);
      imageData.width = 0;
      imageData.height = 0;
      parseImage(imageData, image);
      imageData.width = imageData.width || ((texture.width >> level) - x);
      imageData.height = imageData.height || ((texture.height >> level) - y);

      check$1(
        texture.type === imageData.type &&
        texture.format === imageData.format &&
        texture.internalformat === imageData.internalformat,
        'incompatible format for texture.subimage');
      check$1(
        x >= 0 && y >= 0 &&
        x + imageData.width <= texture.width &&
        y + imageData.height <= texture.height,
        'texture.subimage write out of bounds');
      check$1(
        texture.mipmask & (1 << level),
        'missing mipmap data');
      check$1(
        imageData.data || imageData.element || imageData.needsCopy,
        'missing image data');

      tempBind(texture);
      setSubImage(imageData, GL_TEXTURE_CUBE_MAP_POSITIVE_X$1 + face, x, y, level);
      tempRestore();

      freeImage(imageData);

      return reglTextureCube
    }

    function resize (radius_) {
      var radius = radius_ | 0;
      if (radius === texture.width) {
        return
      }

      reglTextureCube.width = texture.width = radius;
      reglTextureCube.height = texture.height = radius;

      tempBind(texture);
      for (var i = 0; i < 6; ++i) {
        for (var j = 0; texture.mipmask >> j; ++j) {
          gl.texImage2D(
            GL_TEXTURE_CUBE_MAP_POSITIVE_X$1 + i,
            j,
            texture.format,
            radius >> j,
            radius >> j,
            0,
            texture.format,
            texture.type,
            null);
        }
      }
      tempRestore();

      if (config.profile) {
        texture.stats.size = getTextureSize(
          texture.internalformat,
          texture.type,
          reglTextureCube.width,
          reglTextureCube.height,
          false,
          true);
      }

      return reglTextureCube
    }

    reglTextureCube(a0, a1, a2, a3, a4, a5);

    reglTextureCube.subimage = subimage;
    reglTextureCube.resize = resize;
    reglTextureCube._reglType = 'textureCube';
    reglTextureCube._texture = texture;
    if (config.profile) {
      reglTextureCube.stats = texture.stats;
    }
    reglTextureCube.destroy = function () {
      texture.decRef();
    };

    return reglTextureCube
  }

  // Called when regl is destroyed
  function destroyTextures () {
    for (var i = 0; i < numTexUnits; ++i) {
      gl.activeTexture(GL_TEXTURE0$1 + i);
      gl.bindTexture(GL_TEXTURE_2D$1, null);
      textureUnits[i] = null;
    }
    values(textureSet).forEach(destroy);

    stats.cubeCount = 0;
    stats.textureCount = 0;
  }

  if (config.profile) {
    stats.getTotalTextureSize = function () {
      var total = 0;
      Object.keys(textureSet).forEach(function (key) {
        total += textureSet[key].stats.size;
      });
      return total
    };
  }

  function restoreTextures () {
    for (var i = 0; i < numTexUnits; ++i) {
      var tex = textureUnits[i];
      if (tex) {
        tex.bindCount = 0;
        tex.unit = -1;
        textureUnits[i] = null;
      }
    }

    values(textureSet).forEach(function (texture) {
      texture.texture = gl.createTexture();
      gl.bindTexture(texture.target, texture.texture);
      for (var i = 0; i < 32; ++i) {
        if ((texture.mipmask & (1 << i)) === 0) {
          continue
        }
        if (texture.target === GL_TEXTURE_2D$1) {
          gl.texImage2D(GL_TEXTURE_2D$1,
            i,
            texture.internalformat,
            texture.width >> i,
            texture.height >> i,
            0,
            texture.internalformat,
            texture.type,
            null);
        } else {
          for (var j = 0; j < 6; ++j) {
            gl.texImage2D(GL_TEXTURE_CUBE_MAP_POSITIVE_X$1 + j,
              i,
              texture.internalformat,
              texture.width >> i,
              texture.height >> i,
              0,
              texture.internalformat,
              texture.type,
              null);
          }
        }
      }
      setTexInfo(texture.texInfo, texture.target);
    });
  }

  return {
    create2D: createTexture2D,
    createCube: createTextureCube,
    clear: destroyTextures,
    getTexture: function (wrapper) {
      return null
    },
    restore: restoreTextures
  }
}

var GL_RENDERBUFFER = 0x8D41;

var GL_RGBA4$1 = 0x8056;
var GL_RGB5_A1$1 = 0x8057;
var GL_RGB565$1 = 0x8D62;
var GL_DEPTH_COMPONENT16 = 0x81A5;
var GL_STENCIL_INDEX8 = 0x8D48;
var GL_DEPTH_STENCIL$1 = 0x84F9;

var GL_SRGB8_ALPHA8_EXT = 0x8C43;

var GL_RGBA32F_EXT = 0x8814;

var GL_RGBA16F_EXT = 0x881A;
var GL_RGB16F_EXT = 0x881B;

var FORMAT_SIZES = [];

FORMAT_SIZES[GL_RGBA4$1] = 2;
FORMAT_SIZES[GL_RGB5_A1$1] = 2;
FORMAT_SIZES[GL_RGB565$1] = 2;

FORMAT_SIZES[GL_DEPTH_COMPONENT16] = 2;
FORMAT_SIZES[GL_STENCIL_INDEX8] = 1;
FORMAT_SIZES[GL_DEPTH_STENCIL$1] = 4;

FORMAT_SIZES[GL_SRGB8_ALPHA8_EXT] = 4;
FORMAT_SIZES[GL_RGBA32F_EXT] = 16;
FORMAT_SIZES[GL_RGBA16F_EXT] = 8;
FORMAT_SIZES[GL_RGB16F_EXT] = 6;

function getRenderbufferSize (format, width, height) {
  return FORMAT_SIZES[format] * width * height
}

var wrapRenderbuffers = function (gl, extensions, limits, stats, config) {
  var formatTypes = {
    'rgba4': GL_RGBA4$1,
    'rgb565': GL_RGB565$1,
    'rgb5 a1': GL_RGB5_A1$1,
    'depth': GL_DEPTH_COMPONENT16,
    'stencil': GL_STENCIL_INDEX8,
    'depth stencil': GL_DEPTH_STENCIL$1
  };

  if (extensions.ext_srgb) {
    formatTypes['srgba'] = GL_SRGB8_ALPHA8_EXT;
  }

  if (extensions.ext_color_buffer_half_float) {
    formatTypes['rgba16f'] = GL_RGBA16F_EXT;
    formatTypes['rgb16f'] = GL_RGB16F_EXT;
  }

  if (extensions.webgl_color_buffer_float) {
    formatTypes['rgba32f'] = GL_RGBA32F_EXT;
  }

  var formatTypesInvert = [];
  Object.keys(formatTypes).forEach(function (key) {
    var val = formatTypes[key];
    formatTypesInvert[val] = key;
  });

  var renderbufferCount = 0;
  var renderbufferSet = {};

  function REGLRenderbuffer (renderbuffer) {
    this.id = renderbufferCount++;
    this.refCount = 1;

    this.renderbuffer = renderbuffer;

    this.format = GL_RGBA4$1;
    this.width = 0;
    this.height = 0;

    if (config.profile) {
      this.stats = {size: 0};
    }
  }

  REGLRenderbuffer.prototype.decRef = function () {
    if (--this.refCount <= 0) {
      destroy(this);
    }
  };

  function destroy (rb) {
    var handle = rb.renderbuffer;
    check$1(handle, 'must not double destroy renderbuffer');
    gl.bindRenderbuffer(GL_RENDERBUFFER, null);
    gl.deleteRenderbuffer(handle);
    rb.renderbuffer = null;
    rb.refCount = 0;
    delete renderbufferSet[rb.id];
    stats.renderbufferCount--;
  }

  function createRenderbuffer (a, b) {
    var renderbuffer = new REGLRenderbuffer(gl.createRenderbuffer());
    renderbufferSet[renderbuffer.id] = renderbuffer;
    stats.renderbufferCount++;

    function reglRenderbuffer (a, b) {
      var w = 0;
      var h = 0;
      var format = GL_RGBA4$1;

      if (typeof a === 'object' && a) {
        var options = a;
        if ('shape' in options) {
          var shape = options.shape;
          check$1(Array.isArray(shape) && shape.length >= 2,
            'invalid renderbuffer shape');
          w = shape[0] | 0;
          h = shape[1] | 0;
        } else {
          if ('radius' in options) {
            w = h = options.radius | 0;
          }
          if ('width' in options) {
            w = options.width | 0;
          }
          if ('height' in options) {
            h = options.height | 0;
          }
        }
        if ('format' in options) {
          check$1.parameter(options.format, formatTypes,
            'invalid renderbuffer format');
          format = formatTypes[options.format];
        }
      } else if (typeof a === 'number') {
        w = a | 0;
        if (typeof b === 'number') {
          h = b | 0;
        } else {
          h = w;
        }
      } else if (!a) {
        w = h = 1;
      } else {
        check$1.raise('invalid arguments to renderbuffer constructor');
      }

      // check shape
      check$1(
        w > 0 && h > 0 &&
        w <= limits.maxRenderbufferSize && h <= limits.maxRenderbufferSize,
        'invalid renderbuffer size');

      if (w === renderbuffer.width &&
          h === renderbuffer.height &&
          format === renderbuffer.format) {
        return
      }

      reglRenderbuffer.width = renderbuffer.width = w;
      reglRenderbuffer.height = renderbuffer.height = h;
      renderbuffer.format = format;

      gl.bindRenderbuffer(GL_RENDERBUFFER, renderbuffer.renderbuffer);
      gl.renderbufferStorage(GL_RENDERBUFFER, format, w, h);

      check$1(
        gl.getError() === 0,
        'invalid render buffer format');

      if (config.profile) {
        renderbuffer.stats.size = getRenderbufferSize(renderbuffer.format, renderbuffer.width, renderbuffer.height);
      }
      reglRenderbuffer.format = formatTypesInvert[renderbuffer.format];

      return reglRenderbuffer
    }

    function resize (w_, h_) {
      var w = w_ | 0;
      var h = (h_ | 0) || w;

      if (w === renderbuffer.width && h === renderbuffer.height) {
        return reglRenderbuffer
      }

      // check shape
      check$1(
        w > 0 && h > 0 &&
        w <= limits.maxRenderbufferSize && h <= limits.maxRenderbufferSize,
        'invalid renderbuffer size');

      reglRenderbuffer.width = renderbuffer.width = w;
      reglRenderbuffer.height = renderbuffer.height = h;

      gl.bindRenderbuffer(GL_RENDERBUFFER, renderbuffer.renderbuffer);
      gl.renderbufferStorage(GL_RENDERBUFFER, renderbuffer.format, w, h);

      check$1(
        gl.getError() === 0,
        'invalid render buffer format');

      // also, recompute size.
      if (config.profile) {
        renderbuffer.stats.size = getRenderbufferSize(
          renderbuffer.format, renderbuffer.width, renderbuffer.height);
      }

      return reglRenderbuffer
    }

    reglRenderbuffer(a, b);

    reglRenderbuffer.resize = resize;
    reglRenderbuffer._reglType = 'renderbuffer';
    reglRenderbuffer._renderbuffer = renderbuffer;
    if (config.profile) {
      reglRenderbuffer.stats = renderbuffer.stats;
    }
    reglRenderbuffer.destroy = function () {
      renderbuffer.decRef();
    };

    return reglRenderbuffer
  }

  if (config.profile) {
    stats.getTotalRenderbufferSize = function () {
      var total = 0;
      Object.keys(renderbufferSet).forEach(function (key) {
        total += renderbufferSet[key].stats.size;
      });
      return total
    };
  }

  function restoreRenderbuffers () {
    values(renderbufferSet).forEach(function (rb) {
      rb.renderbuffer = gl.createRenderbuffer();
      gl.bindRenderbuffer(GL_RENDERBUFFER, rb.renderbuffer);
      gl.renderbufferStorage(GL_RENDERBUFFER, rb.format, rb.width, rb.height);
    });
    gl.bindRenderbuffer(GL_RENDERBUFFER, null);
  }

  return {
    create: createRenderbuffer,
    clear: function () {
      values(renderbufferSet).forEach(destroy);
    },
    restore: restoreRenderbuffers
  }
};

// We store these constants so that the minifier can inline them
var GL_FRAMEBUFFER$1 = 0x8D40;
var GL_RENDERBUFFER$1 = 0x8D41;

var GL_TEXTURE_2D$2 = 0x0DE1;
var GL_TEXTURE_CUBE_MAP_POSITIVE_X$2 = 0x8515;

var GL_COLOR_ATTACHMENT0$1 = 0x8CE0;
var GL_DEPTH_ATTACHMENT = 0x8D00;
var GL_STENCIL_ATTACHMENT = 0x8D20;
var GL_DEPTH_STENCIL_ATTACHMENT = 0x821A;

var GL_FRAMEBUFFER_COMPLETE$1 = 0x8CD5;
var GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT = 0x8CD6;
var GL_FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT = 0x8CD7;
var GL_FRAMEBUFFER_INCOMPLETE_DIMENSIONS = 0x8CD9;
var GL_FRAMEBUFFER_UNSUPPORTED = 0x8CDD;

var GL_HALF_FLOAT_OES$2 = 0x8D61;
var GL_UNSIGNED_BYTE$6 = 0x1401;
var GL_FLOAT$5 = 0x1406;

var GL_RGB$1 = 0x1907;
var GL_RGBA$2 = 0x1908;

var GL_DEPTH_COMPONENT$1 = 0x1902;

var colorTextureFormatEnums = [
  GL_RGB$1,
  GL_RGBA$2
];

// for every texture format, store
// the number of channels
var textureFormatChannels = [];
textureFormatChannels[GL_RGBA$2] = 4;
textureFormatChannels[GL_RGB$1] = 3;

// for every texture type, store
// the size in bytes.
var textureTypeSizes = [];
textureTypeSizes[GL_UNSIGNED_BYTE$6] = 1;
textureTypeSizes[GL_FLOAT$5] = 4;
textureTypeSizes[GL_HALF_FLOAT_OES$2] = 2;

var GL_RGBA4$2 = 0x8056;
var GL_RGB5_A1$2 = 0x8057;
var GL_RGB565$2 = 0x8D62;
var GL_DEPTH_COMPONENT16$1 = 0x81A5;
var GL_STENCIL_INDEX8$1 = 0x8D48;
var GL_DEPTH_STENCIL$2 = 0x84F9;

var GL_SRGB8_ALPHA8_EXT$1 = 0x8C43;

var GL_RGBA32F_EXT$1 = 0x8814;

var GL_RGBA16F_EXT$1 = 0x881A;
var GL_RGB16F_EXT$1 = 0x881B;

var colorRenderbufferFormatEnums = [
  GL_RGBA4$2,
  GL_RGB5_A1$2,
  GL_RGB565$2,
  GL_SRGB8_ALPHA8_EXT$1,
  GL_RGBA16F_EXT$1,
  GL_RGB16F_EXT$1,
  GL_RGBA32F_EXT$1
];

var statusCode = {};
statusCode[GL_FRAMEBUFFER_COMPLETE$1] = 'complete';
statusCode[GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT] = 'incomplete attachment';
statusCode[GL_FRAMEBUFFER_INCOMPLETE_DIMENSIONS] = 'incomplete dimensions';
statusCode[GL_FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT] = 'incomplete, missing attachment';
statusCode[GL_FRAMEBUFFER_UNSUPPORTED] = 'unsupported';

function wrapFBOState (
  gl,
  extensions,
  limits,
  textureState,
  renderbufferState,
  stats) {
  var framebufferState = {
    cur: null,
    next: null,
    dirty: false,
    setFBO: null
  };

  var colorTextureFormats = ['rgba'];
  var colorRenderbufferFormats = ['rgba4', 'rgb565', 'rgb5 a1'];

  if (extensions.ext_srgb) {
    colorRenderbufferFormats.push('srgba');
  }

  if (extensions.ext_color_buffer_half_float) {
    colorRenderbufferFormats.push('rgba16f', 'rgb16f');
  }

  if (extensions.webgl_color_buffer_float) {
    colorRenderbufferFormats.push('rgba32f');
  }

  var colorTypes = ['uint8'];
  if (extensions.oes_texture_half_float) {
    colorTypes.push('half float', 'float16');
  }
  if (extensions.oes_texture_float) {
    colorTypes.push('float', 'float32');
  }

  function FramebufferAttachment (target, texture, renderbuffer) {
    this.target = target;
    this.texture = texture;
    this.renderbuffer = renderbuffer;

    var w = 0;
    var h = 0;
    if (texture) {
      w = texture.width;
      h = texture.height;
    } else if (renderbuffer) {
      w = renderbuffer.width;
      h = renderbuffer.height;
    }
    this.width = w;
    this.height = h;
  }

  function decRef (attachment) {
    if (attachment) {
      if (attachment.texture) {
        attachment.texture._texture.decRef();
      }
      if (attachment.renderbuffer) {
        attachment.renderbuffer._renderbuffer.decRef();
      }
    }
  }

  function incRefAndCheckShape (attachment, width, height) {
    if (!attachment) {
      return
    }
    if (attachment.texture) {
      var texture = attachment.texture._texture;
      var tw = Math.max(1, texture.width);
      var th = Math.max(1, texture.height);
      check$1(tw === width && th === height,
        'inconsistent width/height for supplied texture');
      texture.refCount += 1;
    } else {
      var renderbuffer = attachment.renderbuffer._renderbuffer;
      check$1(
        renderbuffer.width === width && renderbuffer.height === height,
        'inconsistent width/height for renderbuffer');
      renderbuffer.refCount += 1;
    }
  }

  function attach (location, attachment) {
    if (attachment) {
      if (attachment.texture) {
        gl.framebufferTexture2D(
          GL_FRAMEBUFFER$1,
          location,
          attachment.target,
          attachment.texture._texture.texture,
          0);
      } else {
        gl.framebufferRenderbuffer(
          GL_FRAMEBUFFER$1,
          location,
          GL_RENDERBUFFER$1,
          attachment.renderbuffer._renderbuffer.renderbuffer);
      }
    }
  }

  function parseAttachment (attachment) {
    var target = GL_TEXTURE_2D$2;
    var texture = null;
    var renderbuffer = null;

    var data = attachment;
    if (typeof attachment === 'object') {
      data = attachment.data;
      if ('target' in attachment) {
        target = attachment.target | 0;
      }
    }

    check$1.type(data, 'function', 'invalid attachment data');

    var type = data._reglType;
    if (type === 'texture2d') {
      texture = data;
      check$1(target === GL_TEXTURE_2D$2);
    } else if (type === 'textureCube') {
      texture = data;
      check$1(
        target >= GL_TEXTURE_CUBE_MAP_POSITIVE_X$2 &&
        target < GL_TEXTURE_CUBE_MAP_POSITIVE_X$2 + 6,
        'invalid cube map target');
    } else if (type === 'renderbuffer') {
      renderbuffer = data;
      target = GL_RENDERBUFFER$1;
    } else {
      check$1.raise('invalid regl object for attachment');
    }

    return new FramebufferAttachment(target, texture, renderbuffer)
  }

  function allocAttachment (
    width,
    height,
    isTexture,
    format,
    type) {
    if (isTexture) {
      var texture = textureState.create2D({
        width: width,
        height: height,
        format: format,
        type: type
      });
      texture._texture.refCount = 0;
      return new FramebufferAttachment(GL_TEXTURE_2D$2, texture, null)
    } else {
      var rb = renderbufferState.create({
        width: width,
        height: height,
        format: format
      });
      rb._renderbuffer.refCount = 0;
      return new FramebufferAttachment(GL_RENDERBUFFER$1, null, rb)
    }
  }

  function unwrapAttachment (attachment) {
    return attachment && (attachment.texture || attachment.renderbuffer)
  }

  function resizeAttachment (attachment, w, h) {
    if (attachment) {
      if (attachment.texture) {
        attachment.texture.resize(w, h);
      } else if (attachment.renderbuffer) {
        attachment.renderbuffer.resize(w, h);
      }
      attachment.width = w;
      attachment.height = h;
    }
  }

  var framebufferCount = 0;
  var framebufferSet = {};

  function REGLFramebuffer () {
    this.id = framebufferCount++;
    framebufferSet[this.id] = this;

    this.framebuffer = gl.createFramebuffer();
    this.width = 0;
    this.height = 0;

    this.colorAttachments = [];
    this.depthAttachment = null;
    this.stencilAttachment = null;
    this.depthStencilAttachment = null;
  }

  function decFBORefs (framebuffer) {
    framebuffer.colorAttachments.forEach(decRef);
    decRef(framebuffer.depthAttachment);
    decRef(framebuffer.stencilAttachment);
    decRef(framebuffer.depthStencilAttachment);
  }

  function destroy (framebuffer) {
    var handle = framebuffer.framebuffer;
    check$1(handle, 'must not double destroy framebuffer');
    gl.deleteFramebuffer(handle);
    framebuffer.framebuffer = null;
    stats.framebufferCount--;
    delete framebufferSet[framebuffer.id];
  }

  function updateFramebuffer (framebuffer) {
    var i;

    gl.bindFramebuffer(GL_FRAMEBUFFER$1, framebuffer.framebuffer);
    var colorAttachments = framebuffer.colorAttachments;
    for (i = 0; i < colorAttachments.length; ++i) {
      attach(GL_COLOR_ATTACHMENT0$1 + i, colorAttachments[i]);
    }
    for (i = colorAttachments.length; i < limits.maxColorAttachments; ++i) {
      gl.framebufferTexture2D(
        GL_FRAMEBUFFER$1,
        GL_COLOR_ATTACHMENT0$1 + i,
        GL_TEXTURE_2D$2,
        null,
        0);
    }

    gl.framebufferTexture2D(
      GL_FRAMEBUFFER$1,
      GL_DEPTH_STENCIL_ATTACHMENT,
      GL_TEXTURE_2D$2,
      null,
      0);
    gl.framebufferTexture2D(
      GL_FRAMEBUFFER$1,
      GL_DEPTH_ATTACHMENT,
      GL_TEXTURE_2D$2,
      null,
      0);
    gl.framebufferTexture2D(
      GL_FRAMEBUFFER$1,
      GL_STENCIL_ATTACHMENT,
      GL_TEXTURE_2D$2,
      null,
      0);

    attach(GL_DEPTH_ATTACHMENT, framebuffer.depthAttachment);
    attach(GL_STENCIL_ATTACHMENT, framebuffer.stencilAttachment);
    attach(GL_DEPTH_STENCIL_ATTACHMENT, framebuffer.depthStencilAttachment);

    // Check status code
    var status = gl.checkFramebufferStatus(GL_FRAMEBUFFER$1);
    if (!gl.isContextLost() && status !== GL_FRAMEBUFFER_COMPLETE$1) {
      check$1.raise('framebuffer configuration not supported, status = ' +
        statusCode[status]);
    }

    gl.bindFramebuffer(GL_FRAMEBUFFER$1, framebufferState.next ? framebufferState.next.framebuffer : null);
    framebufferState.cur = framebufferState.next;

    // FIXME: Clear error code here.  This is a work around for a bug in
    // headless-gl
    gl.getError();
  }

  function createFBO (a0, a1) {
    var framebuffer = new REGLFramebuffer();
    stats.framebufferCount++;

    function reglFramebuffer (a, b) {
      var i;

      check$1(framebufferState.next !== framebuffer,
        'can not update framebuffer which is currently in use');

      var width = 0;
      var height = 0;

      var needsDepth = true;
      var needsStencil = true;

      var colorBuffer = null;
      var colorTexture = true;
      var colorFormat = 'rgba';
      var colorType = 'uint8';
      var colorCount = 1;

      var depthBuffer = null;
      var stencilBuffer = null;
      var depthStencilBuffer = null;
      var depthStencilTexture = false;

      if (typeof a === 'number') {
        width = a | 0;
        height = (b | 0) || width;
      } else if (!a) {
        width = height = 1;
      } else {
        check$1.type(a, 'object', 'invalid arguments for framebuffer');
        var options = a;

        if ('shape' in options) {
          var shape = options.shape;
          check$1(Array.isArray(shape) && shape.length >= 2,
            'invalid shape for framebuffer');
          width = shape[0];
          height = shape[1];
        } else {
          if ('radius' in options) {
            width = height = options.radius;
          }
          if ('width' in options) {
            width = options.width;
          }
          if ('height' in options) {
            height = options.height;
          }
        }

        if ('color' in options ||
            'colors' in options) {
          colorBuffer =
            options.color ||
            options.colors;
          if (Array.isArray(colorBuffer)) {
            check$1(
              colorBuffer.length === 1 || extensions.webgl_draw_buffers,
              'multiple render targets not supported');
          }
        }

        if (!colorBuffer) {
          if ('colorCount' in options) {
            colorCount = options.colorCount | 0;
            check$1(colorCount > 0, 'invalid color buffer count');
          }

          if ('colorTexture' in options) {
            colorTexture = !!options.colorTexture;
            colorFormat = 'rgba4';
          }

          if ('colorType' in options) {
            colorType = options.colorType;
            if (!colorTexture) {
              if (colorType === 'half float' || colorType === 'float16') {
                check$1(extensions.ext_color_buffer_half_float,
                  'you must enable EXT_color_buffer_half_float to use 16-bit render buffers');
                colorFormat = 'rgba16f';
              } else if (colorType === 'float' || colorType === 'float32') {
                check$1(extensions.webgl_color_buffer_float,
                  'you must enable WEBGL_color_buffer_float in order to use 32-bit floating point renderbuffers');
                colorFormat = 'rgba32f';
              }
            } else {
              check$1(extensions.oes_texture_float ||
                !(colorType === 'float' || colorType === 'float32'),
                'you must enable OES_texture_float in order to use floating point framebuffer objects');
              check$1(extensions.oes_texture_half_float ||
                !(colorType === 'half float' || colorType === 'float16'),
                'you must enable OES_texture_half_float in order to use 16-bit floating point framebuffer objects');
            }
            check$1.oneOf(colorType, colorTypes, 'invalid color type');
          }

          if ('colorFormat' in options) {
            colorFormat = options.colorFormat;
            if (colorTextureFormats.indexOf(colorFormat) >= 0) {
              colorTexture = true;
            } else if (colorRenderbufferFormats.indexOf(colorFormat) >= 0) {
              colorTexture = false;
            } else {
              if (colorTexture) {
                check$1.oneOf(
                  options.colorFormat, colorTextureFormats,
                  'invalid color format for texture');
              } else {
                check$1.oneOf(
                  options.colorFormat, colorRenderbufferFormats,
                  'invalid color format for renderbuffer');
              }
            }
          }
        }

        if ('depthTexture' in options || 'depthStencilTexture' in options) {
          depthStencilTexture = !!(options.depthTexture ||
            options.depthStencilTexture);
          check$1(!depthStencilTexture || extensions.webgl_depth_texture,
            'webgl_depth_texture extension not supported');
        }

        if ('depth' in options) {
          if (typeof options.depth === 'boolean') {
            needsDepth = options.depth;
          } else {
            depthBuffer = options.depth;
            needsStencil = false;
          }
        }

        if ('stencil' in options) {
          if (typeof options.stencil === 'boolean') {
            needsStencil = options.stencil;
          } else {
            stencilBuffer = options.stencil;
            needsDepth = false;
          }
        }

        if ('depthStencil' in options) {
          if (typeof options.depthStencil === 'boolean') {
            needsDepth = needsStencil = options.depthStencil;
          } else {
            depthStencilBuffer = options.depthStencil;
            needsDepth = false;
            needsStencil = false;
          }
        }
      }

      // parse attachments
      var colorAttachments = null;
      var depthAttachment = null;
      var stencilAttachment = null;
      var depthStencilAttachment = null;

      // Set up color attachments
      if (Array.isArray(colorBuffer)) {
        colorAttachments = colorBuffer.map(parseAttachment);
      } else if (colorBuffer) {
        colorAttachments = [parseAttachment(colorBuffer)];
      } else {
        colorAttachments = new Array(colorCount);
        for (i = 0; i < colorCount; ++i) {
          colorAttachments[i] = allocAttachment(
            width,
            height,
            colorTexture,
            colorFormat,
            colorType);
        }
      }

      check$1(extensions.webgl_draw_buffers || colorAttachments.length <= 1,
        'you must enable the WEBGL_draw_buffers extension in order to use multiple color buffers.');
      check$1(colorAttachments.length <= limits.maxColorAttachments,
        'too many color attachments, not supported');

      width = width || colorAttachments[0].width;
      height = height || colorAttachments[0].height;

      if (depthBuffer) {
        depthAttachment = parseAttachment(depthBuffer);
      } else if (needsDepth && !needsStencil) {
        depthAttachment = allocAttachment(
          width,
          height,
          depthStencilTexture,
          'depth',
          'uint32');
      }

      if (stencilBuffer) {
        stencilAttachment = parseAttachment(stencilBuffer);
      } else if (needsStencil && !needsDepth) {
        stencilAttachment = allocAttachment(
          width,
          height,
          false,
          'stencil',
          'uint8');
      }

      if (depthStencilBuffer) {
        depthStencilAttachment = parseAttachment(depthStencilBuffer);
      } else if (!depthBuffer && !stencilBuffer && needsStencil && needsDepth) {
        depthStencilAttachment = allocAttachment(
          width,
          height,
          depthStencilTexture,
          'depth stencil',
          'depth stencil');
      }

      check$1(
        (!!depthBuffer) + (!!stencilBuffer) + (!!depthStencilBuffer) <= 1,
        'invalid framebuffer configuration, can specify exactly one depth/stencil attachment');

      var commonColorAttachmentSize = null;

      for (i = 0; i < colorAttachments.length; ++i) {
        incRefAndCheckShape(colorAttachments[i], width, height);
        check$1(!colorAttachments[i] ||
          (colorAttachments[i].texture &&
            colorTextureFormatEnums.indexOf(colorAttachments[i].texture._texture.format) >= 0) ||
          (colorAttachments[i].renderbuffer &&
            colorRenderbufferFormatEnums.indexOf(colorAttachments[i].renderbuffer._renderbuffer.format) >= 0),
          'framebuffer color attachment ' + i + ' is invalid');

        if (colorAttachments[i] && colorAttachments[i].texture) {
          var colorAttachmentSize =
              textureFormatChannels[colorAttachments[i].texture._texture.format] *
              textureTypeSizes[colorAttachments[i].texture._texture.type];

          if (commonColorAttachmentSize === null) {
            commonColorAttachmentSize = colorAttachmentSize;
          } else {
            // We need to make sure that all color attachments have the same number of bitplanes
            // (that is, the same numer of bits per pixel)
            // This is required by the GLES2.0 standard. See the beginning of Chapter 4 in that document.
            check$1(commonColorAttachmentSize === colorAttachmentSize,
                  'all color attachments much have the same number of bits per pixel.');
          }
        }
      }
      incRefAndCheckShape(depthAttachment, width, height);
      check$1(!depthAttachment ||
        (depthAttachment.texture &&
          depthAttachment.texture._texture.format === GL_DEPTH_COMPONENT$1) ||
        (depthAttachment.renderbuffer &&
          depthAttachment.renderbuffer._renderbuffer.format === GL_DEPTH_COMPONENT16$1),
        'invalid depth attachment for framebuffer object');
      incRefAndCheckShape(stencilAttachment, width, height);
      check$1(!stencilAttachment ||
        (stencilAttachment.renderbuffer &&
          stencilAttachment.renderbuffer._renderbuffer.format === GL_STENCIL_INDEX8$1),
        'invalid stencil attachment for framebuffer object');
      incRefAndCheckShape(depthStencilAttachment, width, height);
      check$1(!depthStencilAttachment ||
        (depthStencilAttachment.texture &&
          depthStencilAttachment.texture._texture.format === GL_DEPTH_STENCIL$2) ||
        (depthStencilAttachment.renderbuffer &&
          depthStencilAttachment.renderbuffer._renderbuffer.format === GL_DEPTH_STENCIL$2),
        'invalid depth-stencil attachment for framebuffer object');

      // decrement references
      decFBORefs(framebuffer);

      framebuffer.width = width;
      framebuffer.height = height;

      framebuffer.colorAttachments = colorAttachments;
      framebuffer.depthAttachment = depthAttachment;
      framebuffer.stencilAttachment = stencilAttachment;
      framebuffer.depthStencilAttachment = depthStencilAttachment;

      reglFramebuffer.color = colorAttachments.map(unwrapAttachment);
      reglFramebuffer.depth = unwrapAttachment(depthAttachment);
      reglFramebuffer.stencil = unwrapAttachment(stencilAttachment);
      reglFramebuffer.depthStencil = unwrapAttachment(depthStencilAttachment);

      reglFramebuffer.width = framebuffer.width;
      reglFramebuffer.height = framebuffer.height;

      updateFramebuffer(framebuffer);

      return reglFramebuffer
    }

    function resize (w_, h_) {
      check$1(framebufferState.next !== framebuffer,
        'can not resize a framebuffer which is currently in use');

      var w = Math.max(w_ | 0, 1);
      var h = Math.max((h_ | 0) || w, 1);
      if (w === framebuffer.width && h === framebuffer.height) {
        return reglFramebuffer
      }

      // resize all buffers
      var colorAttachments = framebuffer.colorAttachments;
      for (var i = 0; i < colorAttachments.length; ++i) {
        resizeAttachment(colorAttachments[i], w, h);
      }
      resizeAttachment(framebuffer.depthAttachment, w, h);
      resizeAttachment(framebuffer.stencilAttachment, w, h);
      resizeAttachment(framebuffer.depthStencilAttachment, w, h);

      framebuffer.width = reglFramebuffer.width = w;
      framebuffer.height = reglFramebuffer.height = h;

      updateFramebuffer(framebuffer);

      return reglFramebuffer
    }

    reglFramebuffer(a0, a1);

    return extend(reglFramebuffer, {
      resize: resize,
      _reglType: 'framebuffer',
      _framebuffer: framebuffer,
      destroy: function () {
        destroy(framebuffer);
        decFBORefs(framebuffer);
      },
      use: function (block) {
        framebufferState.setFBO({
          framebuffer: reglFramebuffer
        }, block);
      }
    })
  }

  function createCubeFBO (options) {
    var faces = Array(6);

    function reglFramebufferCube (a) {
      var i;

      check$1(faces.indexOf(framebufferState.next) < 0,
        'can not update framebuffer which is currently in use');

      var params = {
        color: null
      };

      var radius = 0;

      var colorBuffer = null;
      var colorFormat = 'rgba';
      var colorType = 'uint8';
      var colorCount = 1;

      if (typeof a === 'number') {
        radius = a | 0;
      } else if (!a) {
        radius = 1;
      } else {
        check$1.type(a, 'object', 'invalid arguments for framebuffer');
        var options = a;

        if ('shape' in options) {
          var shape = options.shape;
          check$1(
            Array.isArray(shape) && shape.length >= 2,
            'invalid shape for framebuffer');
          check$1(
            shape[0] === shape[1],
            'cube framebuffer must be square');
          radius = shape[0];
        } else {
          if ('radius' in options) {
            radius = options.radius | 0;
          }
          if ('width' in options) {
            radius = options.width | 0;
            if ('height' in options) {
              check$1(options.height === radius, 'must be square');
            }
          } else if ('height' in options) {
            radius = options.height | 0;
          }
        }

        if ('color' in options ||
            'colors' in options) {
          colorBuffer =
            options.color ||
            options.colors;
          if (Array.isArray(colorBuffer)) {
            check$1(
              colorBuffer.length === 1 || extensions.webgl_draw_buffers,
              'multiple render targets not supported');
          }
        }

        if (!colorBuffer) {
          if ('colorCount' in options) {
            colorCount = options.colorCount | 0;
            check$1(colorCount > 0, 'invalid color buffer count');
          }

          if ('colorType' in options) {
            check$1.oneOf(
              options.colorType, colorTypes,
              'invalid color type');
            colorType = options.colorType;
          }

          if ('colorFormat' in options) {
            colorFormat = options.colorFormat;
            check$1.oneOf(
              options.colorFormat, colorTextureFormats,
              'invalid color format for texture');
          }
        }

        if ('depth' in options) {
          params.depth = options.depth;
        }

        if ('stencil' in options) {
          params.stencil = options.stencil;
        }

        if ('depthStencil' in options) {
          params.depthStencil = options.depthStencil;
        }
      }

      var colorCubes;
      if (colorBuffer) {
        if (Array.isArray(colorBuffer)) {
          colorCubes = [];
          for (i = 0; i < colorBuffer.length; ++i) {
            colorCubes[i] = colorBuffer[i];
          }
        } else {
          colorCubes = [ colorBuffer ];
        }
      } else {
        colorCubes = Array(colorCount);
        var cubeMapParams = {
          radius: radius,
          format: colorFormat,
          type: colorType
        };
        for (i = 0; i < colorCount; ++i) {
          colorCubes[i] = textureState.createCube(cubeMapParams);
        }
      }

      // Check color cubes
      params.color = Array(colorCubes.length);
      for (i = 0; i < colorCubes.length; ++i) {
        var cube = colorCubes[i];
        check$1(
          typeof cube === 'function' && cube._reglType === 'textureCube',
          'invalid cube map');
        radius = radius || cube.width;
        check$1(
          cube.width === radius && cube.height === radius,
          'invalid cube map shape');
        params.color[i] = {
          target: GL_TEXTURE_CUBE_MAP_POSITIVE_X$2,
          data: colorCubes[i]
        };
      }

      for (i = 0; i < 6; ++i) {
        for (var j = 0; j < colorCubes.length; ++j) {
          params.color[j].target = GL_TEXTURE_CUBE_MAP_POSITIVE_X$2 + i;
        }
        // reuse depth-stencil attachments across all cube maps
        if (i > 0) {
          params.depth = faces[0].depth;
          params.stencil = faces[0].stencil;
          params.depthStencil = faces[0].depthStencil;
        }
        if (faces[i]) {
          (faces[i])(params);
        } else {
          faces[i] = createFBO(params);
        }
      }

      return extend(reglFramebufferCube, {
        width: radius,
        height: radius,
        color: colorCubes
      })
    }

    function resize (radius_) {
      var i;
      var radius = radius_ | 0;
      check$1(radius > 0 && radius <= limits.maxCubeMapSize,
        'invalid radius for cube fbo');

      if (radius === reglFramebufferCube.width) {
        return reglFramebufferCube
      }

      var colors = reglFramebufferCube.color;
      for (i = 0; i < colors.length; ++i) {
        colors[i].resize(radius);
      }

      for (i = 0; i < 6; ++i) {
        faces[i].resize(radius);
      }

      reglFramebufferCube.width = reglFramebufferCube.height = radius;

      return reglFramebufferCube
    }

    reglFramebufferCube(options);

    return extend(reglFramebufferCube, {
      faces: faces,
      resize: resize,
      _reglType: 'framebufferCube',
      destroy: function () {
        faces.forEach(function (f) {
          f.destroy();
        });
      }
    })
  }

  function restoreFramebuffers () {
    framebufferState.cur = null;
    framebufferState.next = null;
    framebufferState.dirty = true;
    values(framebufferSet).forEach(function (fb) {
      fb.framebuffer = gl.createFramebuffer();
      updateFramebuffer(fb);
    });
  }

  return extend(framebufferState, {
    getFramebuffer: function (object) {
      if (typeof object === 'function' && object._reglType === 'framebuffer') {
        var fbo = object._framebuffer;
        if (fbo instanceof REGLFramebuffer) {
          return fbo
        }
      }
      return null
    },
    create: createFBO,
    createCube: createCubeFBO,
    clear: function () {
      values(framebufferSet).forEach(destroy);
    },
    restore: restoreFramebuffers
  })
}

var GL_FLOAT$6 = 5126;

function AttributeRecord () {
  this.state = 0;

  this.x = 0.0;
  this.y = 0.0;
  this.z = 0.0;
  this.w = 0.0;

  this.buffer = null;
  this.size = 0;
  this.normalized = false;
  this.type = GL_FLOAT$6;
  this.offset = 0;
  this.stride = 0;
  this.divisor = 0;
}

function wrapAttributeState (
  gl,
  extensions,
  limits,
  stringStore) {
  var NUM_ATTRIBUTES = limits.maxAttributes;
  var attributeBindings = new Array(NUM_ATTRIBUTES);
  for (var i = 0; i < NUM_ATTRIBUTES; ++i) {
    attributeBindings[i] = new AttributeRecord();
  }

  return {
    Record: AttributeRecord,
    scope: {},
    state: attributeBindings
  }
}

var GL_FRAGMENT_SHADER = 35632;
var GL_VERTEX_SHADER = 35633;

var GL_ACTIVE_UNIFORMS = 0x8B86;
var GL_ACTIVE_ATTRIBUTES = 0x8B89;

function wrapShaderState (gl, stringStore, stats, config) {
  // ===================================================
  // glsl compilation and linking
  // ===================================================
  var fragShaders = {};
  var vertShaders = {};

  function ActiveInfo (name, id, location, info) {
    this.name = name;
    this.id = id;
    this.location = location;
    this.info = info;
  }

  function insertActiveInfo (list, info) {
    for (var i = 0; i < list.length; ++i) {
      if (list[i].id === info.id) {
        list[i].location = info.location;
        return
      }
    }
    list.push(info);
  }

  function getShader (type, id, command) {
    var cache = type === GL_FRAGMENT_SHADER ? fragShaders : vertShaders;
    var shader = cache[id];

    if (!shader) {
      var source = stringStore.str(id);
      shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      check$1.shaderError(gl, shader, source, type, command);
      cache[id] = shader;
    }

    return shader
  }

  // ===================================================
  // program linking
  // ===================================================
  var programCache = {};
  var programList = [];

  var PROGRAM_COUNTER = 0;

  function REGLProgram (fragId, vertId) {
    this.id = PROGRAM_COUNTER++;
    this.fragId = fragId;
    this.vertId = vertId;
    this.program = null;
    this.uniforms = [];
    this.attributes = [];

    if (config.profile) {
      this.stats = {
        uniformsCount: 0,
        attributesCount: 0
      };
    }
  }

  function linkProgram (desc, command) {
    var i, info;

    // -------------------------------
    // compile & link
    // -------------------------------
    var fragShader = getShader(GL_FRAGMENT_SHADER, desc.fragId);
    var vertShader = getShader(GL_VERTEX_SHADER, desc.vertId);

    var program = desc.program = gl.createProgram();
    gl.attachShader(program, fragShader);
    gl.attachShader(program, vertShader);
    gl.linkProgram(program);
    check$1.linkError(
      gl,
      program,
      stringStore.str(desc.fragId),
      stringStore.str(desc.vertId),
      command);

    // -------------------------------
    // grab uniforms
    // -------------------------------
    var numUniforms = gl.getProgramParameter(program, GL_ACTIVE_UNIFORMS);
    if (config.profile) {
      desc.stats.uniformsCount = numUniforms;
    }
    var uniforms = desc.uniforms;
    for (i = 0; i < numUniforms; ++i) {
      info = gl.getActiveUniform(program, i);
      if (info) {
        if (info.size > 1) {
          for (var j = 0; j < info.size; ++j) {
            var name = info.name.replace('[0]', '[' + j + ']');
            insertActiveInfo(uniforms, new ActiveInfo(
              name,
              stringStore.id(name),
              gl.getUniformLocation(program, name),
              info));
          }
        } else {
          insertActiveInfo(uniforms, new ActiveInfo(
            info.name,
            stringStore.id(info.name),
            gl.getUniformLocation(program, info.name),
            info));
        }
      }
    }

    // -------------------------------
    // grab attributes
    // -------------------------------
    var numAttributes = gl.getProgramParameter(program, GL_ACTIVE_ATTRIBUTES);
    if (config.profile) {
      desc.stats.attributesCount = numAttributes;
    }

    var attributes = desc.attributes;
    for (i = 0; i < numAttributes; ++i) {
      info = gl.getActiveAttrib(program, i);
      if (info) {
        insertActiveInfo(attributes, new ActiveInfo(
          info.name,
          stringStore.id(info.name),
          gl.getAttribLocation(program, info.name),
          info));
      }
    }
  }

  if (config.profile) {
    stats.getMaxUniformsCount = function () {
      var m = 0;
      programList.forEach(function (desc) {
        if (desc.stats.uniformsCount > m) {
          m = desc.stats.uniformsCount;
        }
      });
      return m
    };

    stats.getMaxAttributesCount = function () {
      var m = 0;
      programList.forEach(function (desc) {
        if (desc.stats.attributesCount > m) {
          m = desc.stats.attributesCount;
        }
      });
      return m
    };
  }

  function restoreShaders () {
    fragShaders = {};
    vertShaders = {};
    for (var i = 0; i < programList.length; ++i) {
      linkProgram(programList[i]);
    }
  }

  return {
    clear: function () {
      var deleteShader = gl.deleteShader.bind(gl);
      values(fragShaders).forEach(deleteShader);
      fragShaders = {};
      values(vertShaders).forEach(deleteShader);
      vertShaders = {};

      programList.forEach(function (desc) {
        gl.deleteProgram(desc.program);
      });
      programList.length = 0;
      programCache = {};

      stats.shaderCount = 0;
    },

    program: function (vertId, fragId, command) {
      check$1.command(vertId >= 0, 'missing vertex shader', command);
      check$1.command(fragId >= 0, 'missing fragment shader', command);

      var cache = programCache[fragId];
      if (!cache) {
        cache = programCache[fragId] = {};
      }
      var program = cache[vertId];
      if (!program) {
        program = new REGLProgram(fragId, vertId);
        stats.shaderCount++;

        linkProgram(program, command);
        cache[vertId] = program;
        programList.push(program);
      }
      return program
    },

    restore: restoreShaders,

    shader: getShader,

    frag: -1,
    vert: -1
  }
}

var GL_RGBA$3 = 6408;
var GL_UNSIGNED_BYTE$7 = 5121;
var GL_PACK_ALIGNMENT = 0x0D05;
var GL_FLOAT$7 = 0x1406; // 5126

function wrapReadPixels (
  gl,
  framebufferState,
  reglPoll,
  context,
  glAttributes,
  extensions,
  limits) {
  function readPixelsImpl (input) {
    var type;
    if (framebufferState.next === null) {
      check$1(
        glAttributes.preserveDrawingBuffer,
        'you must create a webgl context with "preserveDrawingBuffer":true in order to read pixels from the drawing buffer');
      type = GL_UNSIGNED_BYTE$7;
    } else {
      check$1(
        framebufferState.next.colorAttachments[0].texture !== null,
          'You cannot read from a renderbuffer');
      type = framebufferState.next.colorAttachments[0].texture._texture.type;

      if (extensions.oes_texture_float) {
        check$1(
          type === GL_UNSIGNED_BYTE$7 || type === GL_FLOAT$7,
          'Reading from a framebuffer is only allowed for the types \'uint8\' and \'float\'');

        if (type === GL_FLOAT$7) {
          check$1(limits.readFloat, 'Reading \'float\' values is not permitted in your browser. For a fallback, please see: https://www.npmjs.com/package/glsl-read-float');
        }
      } else {
        check$1(
          type === GL_UNSIGNED_BYTE$7,
          'Reading from a framebuffer is only allowed for the type \'uint8\'');
      }
    }

    var x = 0;
    var y = 0;
    var width = context.framebufferWidth;
    var height = context.framebufferHeight;
    var data = null;

    if (isTypedArray(input)) {
      data = input;
    } else if (input) {
      check$1.type(input, 'object', 'invalid arguments to regl.read()');
      x = input.x | 0;
      y = input.y | 0;
      check$1(
        x >= 0 && x < context.framebufferWidth,
        'invalid x offset for regl.read');
      check$1(
        y >= 0 && y < context.framebufferHeight,
        'invalid y offset for regl.read');
      width = (input.width || (context.framebufferWidth - x)) | 0;
      height = (input.height || (context.framebufferHeight - y)) | 0;
      data = input.data || null;
    }

    // sanity check input.data
    if (data) {
      if (type === GL_UNSIGNED_BYTE$7) {
        check$1(
          data instanceof Uint8Array,
          'buffer must be \'Uint8Array\' when reading from a framebuffer of type \'uint8\'');
      } else if (type === GL_FLOAT$7) {
        check$1(
          data instanceof Float32Array,
          'buffer must be \'Float32Array\' when reading from a framebuffer of type \'float\'');
      }
    }

    check$1(
      width > 0 && width + x <= context.framebufferWidth,
      'invalid width for read pixels');
    check$1(
      height > 0 && height + y <= context.framebufferHeight,
      'invalid height for read pixels');

    // Update WebGL state
    reglPoll();

    // Compute size
    var size = width * height * 4;

    // Allocate data
    if (!data) {
      if (type === GL_UNSIGNED_BYTE$7) {
        data = new Uint8Array(size);
      } else if (type === GL_FLOAT$7) {
        data = data || new Float32Array(size);
      }
    }

    // Type check
    check$1.isTypedArray(data, 'data buffer for regl.read() must be a typedarray');
    check$1(data.byteLength >= size, 'data buffer for regl.read() too small');

    // Run read pixels
    gl.pixelStorei(GL_PACK_ALIGNMENT, 4);
    gl.readPixels(x, y, width, height, GL_RGBA$3,
                  type,
                  data);

    return data
  }

  function readPixelsFBO (options) {
    var result;
    framebufferState.setFBO({
      framebuffer: options.framebuffer
    }, function () {
      result = readPixelsImpl(options);
    });
    return result
  }

  function readPixels (options) {
    if (!options || !('framebuffer' in options)) {
      return readPixelsImpl(options)
    } else {
      return readPixelsFBO(options)
    }
  }

  return readPixels
}

function slice (x) {
  return Array.prototype.slice.call(x)
}

function join (x) {
  return slice(x).join('')
}

function createEnvironment () {
  // Unique variable id counter
  var varCounter = 0;

  // Linked values are passed from this scope into the generated code block
  // Calling link() passes a value into the generated scope and returns
  // the variable name which it is bound to
  var linkedNames = [];
  var linkedValues = [];
  function link (value) {
    for (var i = 0; i < linkedValues.length; ++i) {
      if (linkedValues[i] === value) {
        return linkedNames[i]
      }
    }

    var name = 'g' + (varCounter++);
    linkedNames.push(name);
    linkedValues.push(value);
    return name
  }

  // create a code block
  function block () {
    var code = [];
    function push () {
      code.push.apply(code, slice(arguments));
    }

    var vars = [];
    function def () {
      var name = 'v' + (varCounter++);
      vars.push(name);

      if (arguments.length > 0) {
        code.push(name, '=');
        code.push.apply(code, slice(arguments));
        code.push(';');
      }

      return name
    }

    return extend(push, {
      def: def,
      toString: function () {
        return join([
          (vars.length > 0 ? 'var ' + vars + ';' : ''),
          join(code)
        ])
      }
    })
  }

  function scope () {
    var entry = block();
    var exit = block();

    var entryToString = entry.toString;
    var exitToString = exit.toString;

    function save (object, prop) {
      exit(object, prop, '=', entry.def(object, prop), ';');
    }

    return extend(function () {
      entry.apply(entry, slice(arguments));
    }, {
      def: entry.def,
      entry: entry,
      exit: exit,
      save: save,
      set: function (object, prop, value) {
        save(object, prop);
        entry(object, prop, '=', value, ';');
      },
      toString: function () {
        return entryToString() + exitToString()
      }
    })
  }

  function conditional () {
    var pred = join(arguments);
    var thenBlock = scope();
    var elseBlock = scope();

    var thenToString = thenBlock.toString;
    var elseToString = elseBlock.toString;

    return extend(thenBlock, {
      then: function () {
        thenBlock.apply(thenBlock, slice(arguments));
        return this
      },
      else: function () {
        elseBlock.apply(elseBlock, slice(arguments));
        return this
      },
      toString: function () {
        var elseClause = elseToString();
        if (elseClause) {
          elseClause = 'else{' + elseClause + '}';
        }
        return join([
          'if(', pred, '){',
          thenToString(),
          '}', elseClause
        ])
      }
    })
  }

  // procedure list
  var globalBlock = block();
  var procedures = {};
  function proc (name, count) {
    var args = [];
    function arg () {
      var name = 'a' + args.length;
      args.push(name);
      return name
    }

    count = count || 0;
    for (var i = 0; i < count; ++i) {
      arg();
    }

    var body = scope();
    var bodyToString = body.toString;

    var result = procedures[name] = extend(body, {
      arg: arg,
      toString: function () {
        return join([
          'function(', args.join(), '){',
          bodyToString(),
          '}'
        ])
      }
    });

    return result
  }

  function compile () {
    var code = ['"use strict";',
      globalBlock,
      'return {'];
    Object.keys(procedures).forEach(function (name) {
      code.push('"', name, '":', procedures[name].toString(), ',');
    });
    code.push('}');
    var src = join(code)
      .replace(/;/g, ';\n')
      .replace(/}/g, '}\n')
      .replace(/{/g, '{\n');
    var proc = Function.apply(null, linkedNames.concat(src));
    return proc.apply(null, linkedValues)
  }

  return {
    global: globalBlock,
    link: link,
    block: block,
    proc: proc,
    scope: scope,
    cond: conditional,
    compile: compile
  }
}

// "cute" names for vector components
var CUTE_COMPONENTS = 'xyzw'.split('');

var GL_UNSIGNED_BYTE$8 = 5121;

var ATTRIB_STATE_POINTER = 1;
var ATTRIB_STATE_CONSTANT = 2;

var DYN_FUNC$1 = 0;
var DYN_PROP$1 = 1;
var DYN_CONTEXT$1 = 2;
var DYN_STATE$1 = 3;
var DYN_THUNK = 4;

var S_DITHER = 'dither';
var S_BLEND_ENABLE = 'blend.enable';
var S_BLEND_COLOR = 'blend.color';
var S_BLEND_EQUATION = 'blend.equation';
var S_BLEND_FUNC = 'blend.func';
var S_DEPTH_ENABLE = 'depth.enable';
var S_DEPTH_FUNC = 'depth.func';
var S_DEPTH_RANGE = 'depth.range';
var S_DEPTH_MASK = 'depth.mask';
var S_COLOR_MASK = 'colorMask';
var S_CULL_ENABLE = 'cull.enable';
var S_CULL_FACE = 'cull.face';
var S_FRONT_FACE = 'frontFace';
var S_LINE_WIDTH = 'lineWidth';
var S_POLYGON_OFFSET_ENABLE = 'polygonOffset.enable';
var S_POLYGON_OFFSET_OFFSET = 'polygonOffset.offset';
var S_SAMPLE_ALPHA = 'sample.alpha';
var S_SAMPLE_ENABLE = 'sample.enable';
var S_SAMPLE_COVERAGE = 'sample.coverage';
var S_STENCIL_ENABLE = 'stencil.enable';
var S_STENCIL_MASK = 'stencil.mask';
var S_STENCIL_FUNC = 'stencil.func';
var S_STENCIL_OPFRONT = 'stencil.opFront';
var S_STENCIL_OPBACK = 'stencil.opBack';
var S_SCISSOR_ENABLE = 'scissor.enable';
var S_SCISSOR_BOX = 'scissor.box';
var S_VIEWPORT = 'viewport';

var S_PROFILE = 'profile';

var S_FRAMEBUFFER = 'framebuffer';
var S_VERT = 'vert';
var S_FRAG = 'frag';
var S_ELEMENTS = 'elements';
var S_PRIMITIVE = 'primitive';
var S_COUNT = 'count';
var S_OFFSET = 'offset';
var S_INSTANCES = 'instances';

var SUFFIX_WIDTH = 'Width';
var SUFFIX_HEIGHT = 'Height';

var S_FRAMEBUFFER_WIDTH = S_FRAMEBUFFER + SUFFIX_WIDTH;
var S_FRAMEBUFFER_HEIGHT = S_FRAMEBUFFER + SUFFIX_HEIGHT;
var S_VIEWPORT_WIDTH = S_VIEWPORT + SUFFIX_WIDTH;
var S_VIEWPORT_HEIGHT = S_VIEWPORT + SUFFIX_HEIGHT;
var S_DRAWINGBUFFER = 'drawingBuffer';
var S_DRAWINGBUFFER_WIDTH = S_DRAWINGBUFFER + SUFFIX_WIDTH;
var S_DRAWINGBUFFER_HEIGHT = S_DRAWINGBUFFER + SUFFIX_HEIGHT;

var NESTED_OPTIONS = [
  S_BLEND_FUNC,
  S_BLEND_EQUATION,
  S_STENCIL_FUNC,
  S_STENCIL_OPFRONT,
  S_STENCIL_OPBACK,
  S_SAMPLE_COVERAGE,
  S_VIEWPORT,
  S_SCISSOR_BOX,
  S_POLYGON_OFFSET_OFFSET
];

var GL_ARRAY_BUFFER$1 = 34962;
var GL_ELEMENT_ARRAY_BUFFER$1 = 34963;

var GL_FRAGMENT_SHADER$1 = 35632;
var GL_VERTEX_SHADER$1 = 35633;

var GL_TEXTURE_2D$3 = 0x0DE1;
var GL_TEXTURE_CUBE_MAP$2 = 0x8513;

var GL_CULL_FACE = 0x0B44;
var GL_BLEND = 0x0BE2;
var GL_DITHER = 0x0BD0;
var GL_STENCIL_TEST = 0x0B90;
var GL_DEPTH_TEST = 0x0B71;
var GL_SCISSOR_TEST = 0x0C11;
var GL_POLYGON_OFFSET_FILL = 0x8037;
var GL_SAMPLE_ALPHA_TO_COVERAGE = 0x809E;
var GL_SAMPLE_COVERAGE = 0x80A0;

var GL_FLOAT$8 = 5126;
var GL_FLOAT_VEC2 = 35664;
var GL_FLOAT_VEC3 = 35665;
var GL_FLOAT_VEC4 = 35666;
var GL_INT$3 = 5124;
var GL_INT_VEC2 = 35667;
var GL_INT_VEC3 = 35668;
var GL_INT_VEC4 = 35669;
var GL_BOOL = 35670;
var GL_BOOL_VEC2 = 35671;
var GL_BOOL_VEC3 = 35672;
var GL_BOOL_VEC4 = 35673;
var GL_FLOAT_MAT2 = 35674;
var GL_FLOAT_MAT3 = 35675;
var GL_FLOAT_MAT4 = 35676;
var GL_SAMPLER_2D = 35678;
var GL_SAMPLER_CUBE = 35680;

var GL_TRIANGLES$1 = 4;

var GL_FRONT = 1028;
var GL_BACK = 1029;
var GL_CW = 0x0900;
var GL_CCW = 0x0901;
var GL_MIN_EXT = 0x8007;
var GL_MAX_EXT = 0x8008;
var GL_ALWAYS = 519;
var GL_KEEP = 7680;
var GL_ZERO = 0;
var GL_ONE = 1;
var GL_FUNC_ADD = 0x8006;
var GL_LESS = 513;

var GL_FRAMEBUFFER$2 = 0x8D40;
var GL_COLOR_ATTACHMENT0$2 = 0x8CE0;

var blendFuncs = {
  '0': 0,
  '1': 1,
  'zero': 0,
  'one': 1,
  'src color': 768,
  'one minus src color': 769,
  'src alpha': 770,
  'one minus src alpha': 771,
  'dst color': 774,
  'one minus dst color': 775,
  'dst alpha': 772,
  'one minus dst alpha': 773,
  'constant color': 32769,
  'one minus constant color': 32770,
  'constant alpha': 32771,
  'one minus constant alpha': 32772,
  'src alpha saturate': 776
};

// There are invalid values for srcRGB and dstRGB. See:
// https://www.khronos.org/registry/webgl/specs/1.0/#6.13
// https://github.com/KhronosGroup/WebGL/blob/0d3201f5f7ec3c0060bc1f04077461541f1987b9/conformance-suites/1.0.3/conformance/misc/webgl-specific.html#L56
var invalidBlendCombinations = [
  'constant color, constant alpha',
  'one minus constant color, constant alpha',
  'constant color, one minus constant alpha',
  'one minus constant color, one minus constant alpha',
  'constant alpha, constant color',
  'constant alpha, one minus constant color',
  'one minus constant alpha, constant color',
  'one minus constant alpha, one minus constant color'
];

var compareFuncs = {
  'never': 512,
  'less': 513,
  '<': 513,
  'equal': 514,
  '=': 514,
  '==': 514,
  '===': 514,
  'lequal': 515,
  '<=': 515,
  'greater': 516,
  '>': 516,
  'notequal': 517,
  '!=': 517,
  '!==': 517,
  'gequal': 518,
  '>=': 518,
  'always': 519
};

var stencilOps = {
  '0': 0,
  'zero': 0,
  'keep': 7680,
  'replace': 7681,
  'increment': 7682,
  'decrement': 7683,
  'increment wrap': 34055,
  'decrement wrap': 34056,
  'invert': 5386
};

var shaderType = {
  'frag': GL_FRAGMENT_SHADER$1,
  'vert': GL_VERTEX_SHADER$1
};

var orientationType = {
  'cw': GL_CW,
  'ccw': GL_CCW
};

function isBufferArgs (x) {
  return Array.isArray(x) ||
    isTypedArray(x) ||
    isNDArrayLike(x)
}

// Make sure viewport is processed first
function sortState (state) {
  return state.sort(function (a, b) {
    if (a === S_VIEWPORT) {
      return -1
    } else if (b === S_VIEWPORT) {
      return 1
    }
    return (a < b) ? -1 : 1
  })
}

function Declaration (thisDep, contextDep, propDep, append) {
  this.thisDep = thisDep;
  this.contextDep = contextDep;
  this.propDep = propDep;
  this.append = append;
}

function isStatic (decl) {
  return decl && !(decl.thisDep || decl.contextDep || decl.propDep)
}

function createStaticDecl (append) {
  return new Declaration(false, false, false, append)
}

function createDynamicDecl (dyn, append) {
  var type = dyn.type;
  if (type === DYN_FUNC$1) {
    var numArgs = dyn.data.length;
    return new Declaration(
      true,
      numArgs >= 1,
      numArgs >= 2,
      append)
  } else if (type === DYN_THUNK) {
    var data = dyn.data;
    return new Declaration(
      data.thisDep,
      data.contextDep,
      data.propDep,
      append)
  } else {
    return new Declaration(
      type === DYN_STATE$1,
      type === DYN_CONTEXT$1,
      type === DYN_PROP$1,
      append)
  }
}

var SCOPE_DECL = new Declaration(false, false, false, function () {});

function reglCore (
  gl,
  stringStore,
  extensions,
  limits,
  bufferState,
  elementState,
  textureState,
  framebufferState,
  uniformState,
  attributeState,
  shaderState,
  drawState,
  contextState,
  timer,
  config) {
  var AttributeRecord = attributeState.Record;

  var blendEquations = {
    'add': 32774,
    'subtract': 32778,
    'reverse subtract': 32779
  };
  if (extensions.ext_blend_minmax) {
    blendEquations.min = GL_MIN_EXT;
    blendEquations.max = GL_MAX_EXT;
  }

  var extInstancing = extensions.angle_instanced_arrays;
  var extDrawBuffers = extensions.webgl_draw_buffers;

  // ===================================================
  // ===================================================
  // WEBGL STATE
  // ===================================================
  // ===================================================
  var currentState = {
    dirty: true,
    profile: config.profile
  };
  var nextState = {};
  var GL_STATE_NAMES = [];
  var GL_FLAGS = {};
  var GL_VARIABLES = {};

  function propName (name) {
    return name.replace('.', '_')
  }

  function stateFlag (sname, cap, init) {
    var name = propName(sname);
    GL_STATE_NAMES.push(sname);
    nextState[name] = currentState[name] = !!init;
    GL_FLAGS[name] = cap;
  }

  function stateVariable (sname, func, init) {
    var name = propName(sname);
    GL_STATE_NAMES.push(sname);
    if (Array.isArray(init)) {
      currentState[name] = init.slice();
      nextState[name] = init.slice();
    } else {
      currentState[name] = nextState[name] = init;
    }
    GL_VARIABLES[name] = func;
  }

  // Dithering
  stateFlag(S_DITHER, GL_DITHER);

  // Blending
  stateFlag(S_BLEND_ENABLE, GL_BLEND);
  stateVariable(S_BLEND_COLOR, 'blendColor', [0, 0, 0, 0]);
  stateVariable(S_BLEND_EQUATION, 'blendEquationSeparate',
    [GL_FUNC_ADD, GL_FUNC_ADD]);
  stateVariable(S_BLEND_FUNC, 'blendFuncSeparate',
    [GL_ONE, GL_ZERO, GL_ONE, GL_ZERO]);

  // Depth
  stateFlag(S_DEPTH_ENABLE, GL_DEPTH_TEST, true);
  stateVariable(S_DEPTH_FUNC, 'depthFunc', GL_LESS);
  stateVariable(S_DEPTH_RANGE, 'depthRange', [0, 1]);
  stateVariable(S_DEPTH_MASK, 'depthMask', true);

  // Color mask
  stateVariable(S_COLOR_MASK, S_COLOR_MASK, [true, true, true, true]);

  // Face culling
  stateFlag(S_CULL_ENABLE, GL_CULL_FACE);
  stateVariable(S_CULL_FACE, 'cullFace', GL_BACK);

  // Front face orientation
  stateVariable(S_FRONT_FACE, S_FRONT_FACE, GL_CCW);

  // Line width
  stateVariable(S_LINE_WIDTH, S_LINE_WIDTH, 1);

  // Polygon offset
  stateFlag(S_POLYGON_OFFSET_ENABLE, GL_POLYGON_OFFSET_FILL);
  stateVariable(S_POLYGON_OFFSET_OFFSET, 'polygonOffset', [0, 0]);

  // Sample coverage
  stateFlag(S_SAMPLE_ALPHA, GL_SAMPLE_ALPHA_TO_COVERAGE);
  stateFlag(S_SAMPLE_ENABLE, GL_SAMPLE_COVERAGE);
  stateVariable(S_SAMPLE_COVERAGE, 'sampleCoverage', [1, false]);

  // Stencil
  stateFlag(S_STENCIL_ENABLE, GL_STENCIL_TEST);
  stateVariable(S_STENCIL_MASK, 'stencilMask', -1);
  stateVariable(S_STENCIL_FUNC, 'stencilFunc', [GL_ALWAYS, 0, -1]);
  stateVariable(S_STENCIL_OPFRONT, 'stencilOpSeparate',
    [GL_FRONT, GL_KEEP, GL_KEEP, GL_KEEP]);
  stateVariable(S_STENCIL_OPBACK, 'stencilOpSeparate',
    [GL_BACK, GL_KEEP, GL_KEEP, GL_KEEP]);

  // Scissor
  stateFlag(S_SCISSOR_ENABLE, GL_SCISSOR_TEST);
  stateVariable(S_SCISSOR_BOX, 'scissor',
    [0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight]);

  // Viewport
  stateVariable(S_VIEWPORT, S_VIEWPORT,
    [0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight]);

  // ===================================================
  // ===================================================
  // ENVIRONMENT
  // ===================================================
  // ===================================================
  var sharedState = {
    gl: gl,
    context: contextState,
    strings: stringStore,
    next: nextState,
    current: currentState,
    draw: drawState,
    elements: elementState,
    buffer: bufferState,
    shader: shaderState,
    attributes: attributeState.state,
    uniforms: uniformState,
    framebuffer: framebufferState,
    extensions: extensions,

    timer: timer,
    isBufferArgs: isBufferArgs
  };

  var sharedConstants = {
    primTypes: primTypes,
    compareFuncs: compareFuncs,
    blendFuncs: blendFuncs,
    blendEquations: blendEquations,
    stencilOps: stencilOps,
    glTypes: glTypes,
    orientationType: orientationType
  };

  check$1.optional(function () {
    sharedState.isArrayLike = isArrayLike;
  });

  if (extDrawBuffers) {
    sharedConstants.backBuffer = [GL_BACK];
    sharedConstants.drawBuffer = loop(limits.maxDrawbuffers, function (i) {
      if (i === 0) {
        return [0]
      }
      return loop(i, function (j) {
        return GL_COLOR_ATTACHMENT0$2 + j
      })
    });
  }

  var drawCallCounter = 0;
  function createREGLEnvironment () {
    var env = createEnvironment();
    var link = env.link;
    var global = env.global;
    env.id = drawCallCounter++;

    env.batchId = '0';

    // link shared state
    var SHARED = link(sharedState);
    var shared = env.shared = {
      props: 'a0'
    };
    Object.keys(sharedState).forEach(function (prop) {
      shared[prop] = global.def(SHARED, '.', prop);
    });

    // Inject runtime assertion stuff for debug builds
    check$1.optional(function () {
      env.CHECK = link(check$1);
      env.commandStr = check$1.guessCommand();
      env.command = link(env.commandStr);
      env.assert = function (block, pred, message) {
        block(
          'if(!(', pred, '))',
          this.CHECK, '.commandRaise(', link(message), ',', this.command, ');');
      };

      sharedConstants.invalidBlendCombinations = invalidBlendCombinations;
    });

    // Copy GL state variables over
    var nextVars = env.next = {};
    var currentVars = env.current = {};
    Object.keys(GL_VARIABLES).forEach(function (variable) {
      if (Array.isArray(currentState[variable])) {
        nextVars[variable] = global.def(shared.next, '.', variable);
        currentVars[variable] = global.def(shared.current, '.', variable);
      }
    });

    // Initialize shared constants
    var constants = env.constants = {};
    Object.keys(sharedConstants).forEach(function (name) {
      constants[name] = global.def(JSON.stringify(sharedConstants[name]));
    });

    // Helper function for calling a block
    env.invoke = function (block, x) {
      switch (x.type) {
        case DYN_FUNC$1:
          var argList = [
            'this',
            shared.context,
            shared.props,
            env.batchId
          ];
          return block.def(
            link(x.data), '.call(',
              argList.slice(0, Math.max(x.data.length + 1, 4)),
             ')')
        case DYN_PROP$1:
          return block.def(shared.props, x.data)
        case DYN_CONTEXT$1:
          return block.def(shared.context, x.data)
        case DYN_STATE$1:
          return block.def('this', x.data)
        case DYN_THUNK:
          x.data.append(env, block);
          return x.data.ref
      }
    };

    env.attribCache = {};

    var scopeAttribs = {};
    env.scopeAttrib = function (name) {
      var id = stringStore.id(name);
      if (id in scopeAttribs) {
        return scopeAttribs[id]
      }
      var binding = attributeState.scope[id];
      if (!binding) {
        binding = attributeState.scope[id] = new AttributeRecord();
      }
      var result = scopeAttribs[id] = link(binding);
      return result
    };

    return env
  }

  // ===================================================
  // ===================================================
  // PARSING
  // ===================================================
  // ===================================================
  function parseProfile (options) {
    var staticOptions = options.static;
    var dynamicOptions = options.dynamic;

    var profileEnable;
    if (S_PROFILE in staticOptions) {
      var value = !!staticOptions[S_PROFILE];
      profileEnable = createStaticDecl(function (env, scope) {
        return value
      });
      profileEnable.enable = value;
    } else if (S_PROFILE in dynamicOptions) {
      var dyn = dynamicOptions[S_PROFILE];
      profileEnable = createDynamicDecl(dyn, function (env, scope) {
        return env.invoke(scope, dyn)
      });
    }

    return profileEnable
  }

  function parseFramebuffer (options, env) {
    var staticOptions = options.static;
    var dynamicOptions = options.dynamic;

    if (S_FRAMEBUFFER in staticOptions) {
      var framebuffer = staticOptions[S_FRAMEBUFFER];
      if (framebuffer) {
        framebuffer = framebufferState.getFramebuffer(framebuffer);
        check$1.command(framebuffer, 'invalid framebuffer object');
        return createStaticDecl(function (env, block) {
          var FRAMEBUFFER = env.link(framebuffer);
          var shared = env.shared;
          block.set(
            shared.framebuffer,
            '.next',
            FRAMEBUFFER);
          var CONTEXT = shared.context;
          block.set(
            CONTEXT,
            '.' + S_FRAMEBUFFER_WIDTH,
            FRAMEBUFFER + '.width');
          block.set(
            CONTEXT,
            '.' + S_FRAMEBUFFER_HEIGHT,
            FRAMEBUFFER + '.height');
          return FRAMEBUFFER
        })
      } else {
        return createStaticDecl(function (env, scope) {
          var shared = env.shared;
          scope.set(
            shared.framebuffer,
            '.next',
            'null');
          var CONTEXT = shared.context;
          scope.set(
            CONTEXT,
            '.' + S_FRAMEBUFFER_WIDTH,
            CONTEXT + '.' + S_DRAWINGBUFFER_WIDTH);
          scope.set(
            CONTEXT,
            '.' + S_FRAMEBUFFER_HEIGHT,
            CONTEXT + '.' + S_DRAWINGBUFFER_HEIGHT);
          return 'null'
        })
      }
    } else if (S_FRAMEBUFFER in dynamicOptions) {
      var dyn = dynamicOptions[S_FRAMEBUFFER];
      return createDynamicDecl(dyn, function (env, scope) {
        var FRAMEBUFFER_FUNC = env.invoke(scope, dyn);
        var shared = env.shared;
        var FRAMEBUFFER_STATE = shared.framebuffer;
        var FRAMEBUFFER = scope.def(
          FRAMEBUFFER_STATE, '.getFramebuffer(', FRAMEBUFFER_FUNC, ')');

        check$1.optional(function () {
          env.assert(scope,
            '!' + FRAMEBUFFER_FUNC + '||' + FRAMEBUFFER,
            'invalid framebuffer object');
        });

        scope.set(
          FRAMEBUFFER_STATE,
          '.next',
          FRAMEBUFFER);
        var CONTEXT = shared.context;
        scope.set(
          CONTEXT,
          '.' + S_FRAMEBUFFER_WIDTH,
          FRAMEBUFFER + '?' + FRAMEBUFFER + '.width:' +
          CONTEXT + '.' + S_DRAWINGBUFFER_WIDTH);
        scope.set(
          CONTEXT,
          '.' + S_FRAMEBUFFER_HEIGHT,
          FRAMEBUFFER +
          '?' + FRAMEBUFFER + '.height:' +
          CONTEXT + '.' + S_DRAWINGBUFFER_HEIGHT);
        return FRAMEBUFFER
      })
    } else {
      return null
    }
  }

  function parseViewportScissor (options, framebuffer, env) {
    var staticOptions = options.static;
    var dynamicOptions = options.dynamic;

    function parseBox (param) {
      if (param in staticOptions) {
        var box = staticOptions[param];
        check$1.commandType(box, 'object', 'invalid ' + param, env.commandStr);

        var isStatic = true;
        var x = box.x | 0;
        var y = box.y | 0;
        var w, h;
        if ('width' in box) {
          w = box.width | 0;
          check$1.command(w >= 0, 'invalid ' + param, env.commandStr);
        } else {
          isStatic = false;
        }
        if ('height' in box) {
          h = box.height | 0;
          check$1.command(h >= 0, 'invalid ' + param, env.commandStr);
        } else {
          isStatic = false;
        }

        return new Declaration(
          !isStatic && framebuffer && framebuffer.thisDep,
          !isStatic && framebuffer && framebuffer.contextDep,
          !isStatic && framebuffer && framebuffer.propDep,
          function (env, scope) {
            var CONTEXT = env.shared.context;
            var BOX_W = w;
            if (!('width' in box)) {
              BOX_W = scope.def(CONTEXT, '.', S_FRAMEBUFFER_WIDTH, '-', x);
            }
            var BOX_H = h;
            if (!('height' in box)) {
              BOX_H = scope.def(CONTEXT, '.', S_FRAMEBUFFER_HEIGHT, '-', y);
            }
            return [x, y, BOX_W, BOX_H]
          })
      } else if (param in dynamicOptions) {
        var dynBox = dynamicOptions[param];
        var result = createDynamicDecl(dynBox, function (env, scope) {
          var BOX = env.invoke(scope, dynBox);

          check$1.optional(function () {
            env.assert(scope,
              BOX + '&&typeof ' + BOX + '==="object"',
              'invalid ' + param);
          });

          var CONTEXT = env.shared.context;
          var BOX_X = scope.def(BOX, '.x|0');
          var BOX_Y = scope.def(BOX, '.y|0');
          var BOX_W = scope.def(
            '"width" in ', BOX, '?', BOX, '.width|0:',
            '(', CONTEXT, '.', S_FRAMEBUFFER_WIDTH, '-', BOX_X, ')');
          var BOX_H = scope.def(
            '"height" in ', BOX, '?', BOX, '.height|0:',
            '(', CONTEXT, '.', S_FRAMEBUFFER_HEIGHT, '-', BOX_Y, ')');

          check$1.optional(function () {
            env.assert(scope,
              BOX_W + '>=0&&' +
              BOX_H + '>=0',
              'invalid ' + param);
          });

          return [BOX_X, BOX_Y, BOX_W, BOX_H]
        });
        if (framebuffer) {
          result.thisDep = result.thisDep || framebuffer.thisDep;
          result.contextDep = result.contextDep || framebuffer.contextDep;
          result.propDep = result.propDep || framebuffer.propDep;
        }
        return result
      } else if (framebuffer) {
        return new Declaration(
          framebuffer.thisDep,
          framebuffer.contextDep,
          framebuffer.propDep,
          function (env, scope) {
            var CONTEXT = env.shared.context;
            return [
              0, 0,
              scope.def(CONTEXT, '.', S_FRAMEBUFFER_WIDTH),
              scope.def(CONTEXT, '.', S_FRAMEBUFFER_HEIGHT)]
          })
      } else {
        return null
      }
    }

    var viewport = parseBox(S_VIEWPORT);

    if (viewport) {
      var prevViewport = viewport;
      viewport = new Declaration(
        viewport.thisDep,
        viewport.contextDep,
        viewport.propDep,
        function (env, scope) {
          var VIEWPORT = prevViewport.append(env, scope);
          var CONTEXT = env.shared.context;
          scope.set(
            CONTEXT,
            '.' + S_VIEWPORT_WIDTH,
            VIEWPORT[2]);
          scope.set(
            CONTEXT,
            '.' + S_VIEWPORT_HEIGHT,
            VIEWPORT[3]);
          return VIEWPORT
        });
    }

    return {
      viewport: viewport,
      scissor_box: parseBox(S_SCISSOR_BOX)
    }
  }

  function parseProgram (options) {
    var staticOptions = options.static;
    var dynamicOptions = options.dynamic;

    function parseShader (name) {
      if (name in staticOptions) {
        var id = stringStore.id(staticOptions[name]);
        check$1.optional(function () {
          shaderState.shader(shaderType[name], id, check$1.guessCommand());
        });
        var result = createStaticDecl(function () {
          return id
        });
        result.id = id;
        return result
      } else if (name in dynamicOptions) {
        var dyn = dynamicOptions[name];
        return createDynamicDecl(dyn, function (env, scope) {
          var str = env.invoke(scope, dyn);
          var id = scope.def(env.shared.strings, '.id(', str, ')');
          check$1.optional(function () {
            scope(
              env.shared.shader, '.shader(',
              shaderType[name], ',',
              id, ',',
              env.command, ');');
          });
          return id
        })
      }
      return null
    }

    var frag = parseShader(S_FRAG);
    var vert = parseShader(S_VERT);

    var program = null;
    var progVar;
    if (isStatic(frag) && isStatic(vert)) {
      program = shaderState.program(vert.id, frag.id);
      progVar = createStaticDecl(function (env, scope) {
        return env.link(program)
      });
    } else {
      progVar = new Declaration(
        (frag && frag.thisDep) || (vert && vert.thisDep),
        (frag && frag.contextDep) || (vert && vert.contextDep),
        (frag && frag.propDep) || (vert && vert.propDep),
        function (env, scope) {
          var SHADER_STATE = env.shared.shader;
          var fragId;
          if (frag) {
            fragId = frag.append(env, scope);
          } else {
            fragId = scope.def(SHADER_STATE, '.', S_FRAG);
          }
          var vertId;
          if (vert) {
            vertId = vert.append(env, scope);
          } else {
            vertId = scope.def(SHADER_STATE, '.', S_VERT);
          }
          var progDef = SHADER_STATE + '.program(' + vertId + ',' + fragId;
          check$1.optional(function () {
            progDef += ',' + env.command;
          });
          return scope.def(progDef + ')')
        });
    }

    return {
      frag: frag,
      vert: vert,
      progVar: progVar,
      program: program
    }
  }

  function parseDraw (options, env) {
    var staticOptions = options.static;
    var dynamicOptions = options.dynamic;

    function parseElements () {
      if (S_ELEMENTS in staticOptions) {
        var elements = staticOptions[S_ELEMENTS];
        if (isBufferArgs(elements)) {
          elements = elementState.getElements(elementState.create(elements, true));
        } else if (elements) {
          elements = elementState.getElements(elements);
          check$1.command(elements, 'invalid elements', env.commandStr);
        }
        var result = createStaticDecl(function (env, scope) {
          if (elements) {
            var result = env.link(elements);
            env.ELEMENTS = result;
            return result
          }
          env.ELEMENTS = null;
          return null
        });
        result.value = elements;
        return result
      } else if (S_ELEMENTS in dynamicOptions) {
        var dyn = dynamicOptions[S_ELEMENTS];
        return createDynamicDecl(dyn, function (env, scope) {
          var shared = env.shared;

          var IS_BUFFER_ARGS = shared.isBufferArgs;
          var ELEMENT_STATE = shared.elements;

          var elementDefn = env.invoke(scope, dyn);
          var elements = scope.def('null');
          var elementStream = scope.def(IS_BUFFER_ARGS, '(', elementDefn, ')');

          var ifte = env.cond(elementStream)
            .then(elements, '=', ELEMENT_STATE, '.createStream(', elementDefn, ');')
            .else(elements, '=', ELEMENT_STATE, '.getElements(', elementDefn, ');');

          check$1.optional(function () {
            env.assert(ifte.else,
              '!' + elementDefn + '||' + elements,
              'invalid elements');
          });

          scope.entry(ifte);
          scope.exit(
            env.cond(elementStream)
              .then(ELEMENT_STATE, '.destroyStream(', elements, ');'));

          env.ELEMENTS = elements;

          return elements
        })
      }

      return null
    }

    var elements = parseElements();

    function parsePrimitive () {
      if (S_PRIMITIVE in staticOptions) {
        var primitive = staticOptions[S_PRIMITIVE];
        check$1.commandParameter(primitive, primTypes, 'invalid primitve', env.commandStr);
        return createStaticDecl(function (env, scope) {
          return primTypes[primitive]
        })
      } else if (S_PRIMITIVE in dynamicOptions) {
        var dynPrimitive = dynamicOptions[S_PRIMITIVE];
        return createDynamicDecl(dynPrimitive, function (env, scope) {
          var PRIM_TYPES = env.constants.primTypes;
          var prim = env.invoke(scope, dynPrimitive);
          check$1.optional(function () {
            env.assert(scope,
              prim + ' in ' + PRIM_TYPES,
              'invalid primitive, must be one of ' + Object.keys(primTypes));
          });
          return scope.def(PRIM_TYPES, '[', prim, ']')
        })
      } else if (elements) {
        if (isStatic(elements)) {
          if (elements.value) {
            return createStaticDecl(function (env, scope) {
              return scope.def(env.ELEMENTS, '.primType')
            })
          } else {
            return createStaticDecl(function () {
              return GL_TRIANGLES$1
            })
          }
        } else {
          return new Declaration(
            elements.thisDep,
            elements.contextDep,
            elements.propDep,
            function (env, scope) {
              var elements = env.ELEMENTS;
              return scope.def(elements, '?', elements, '.primType:', GL_TRIANGLES$1)
            })
        }
      }
      return null
    }

    function parseParam (param, isOffset) {
      if (param in staticOptions) {
        var value = staticOptions[param] | 0;
        check$1.command(!isOffset || value >= 0, 'invalid ' + param, env.commandStr);
        return createStaticDecl(function (env, scope) {
          if (isOffset) {
            env.OFFSET = value;
          }
          return value
        })
      } else if (param in dynamicOptions) {
        var dynValue = dynamicOptions[param];
        return createDynamicDecl(dynValue, function (env, scope) {
          var result = env.invoke(scope, dynValue);
          if (isOffset) {
            env.OFFSET = result;
            check$1.optional(function () {
              env.assert(scope,
                result + '>=0',
                'invalid ' + param);
            });
          }
          return result
        })
      } else if (isOffset && elements) {
        return createStaticDecl(function (env, scope) {
          env.OFFSET = '0';
          return 0
        })
      }
      return null
    }

    var OFFSET = parseParam(S_OFFSET, true);

    function parseVertCount () {
      if (S_COUNT in staticOptions) {
        var count = staticOptions[S_COUNT] | 0;
        check$1.command(
          typeof count === 'number' && count >= 0, 'invalid vertex count', env.commandStr);
        return createStaticDecl(function () {
          return count
        })
      } else if (S_COUNT in dynamicOptions) {
        var dynCount = dynamicOptions[S_COUNT];
        return createDynamicDecl(dynCount, function (env, scope) {
          var result = env.invoke(scope, dynCount);
          check$1.optional(function () {
            env.assert(scope,
              'typeof ' + result + '==="number"&&' +
              result + '>=0&&' +
              result + '===(' + result + '|0)',
              'invalid vertex count');
          });
          return result
        })
      } else if (elements) {
        if (isStatic(elements)) {
          if (elements) {
            if (OFFSET) {
              return new Declaration(
                OFFSET.thisDep,
                OFFSET.contextDep,
                OFFSET.propDep,
                function (env, scope) {
                  var result = scope.def(
                    env.ELEMENTS, '.vertCount-', env.OFFSET);

                  check$1.optional(function () {
                    env.assert(scope,
                      result + '>=0',
                      'invalid vertex offset/element buffer too small');
                  });

                  return result
                })
            } else {
              return createStaticDecl(function (env, scope) {
                return scope.def(env.ELEMENTS, '.vertCount')
              })
            }
          } else {
            var result = createStaticDecl(function () {
              return -1
            });
            check$1.optional(function () {
              result.MISSING = true;
            });
            return result
          }
        } else {
          var variable = new Declaration(
            elements.thisDep || OFFSET.thisDep,
            elements.contextDep || OFFSET.contextDep,
            elements.propDep || OFFSET.propDep,
            function (env, scope) {
              var elements = env.ELEMENTS;
              if (env.OFFSET) {
                return scope.def(elements, '?', elements, '.vertCount-',
                  env.OFFSET, ':-1')
              }
              return scope.def(elements, '?', elements, '.vertCount:-1')
            });
          check$1.optional(function () {
            variable.DYNAMIC = true;
          });
          return variable
        }
      }
      return null
    }

    return {
      elements: elements,
      primitive: parsePrimitive(),
      count: parseVertCount(),
      instances: parseParam(S_INSTANCES, false),
      offset: OFFSET
    }
  }

  function parseGLState (options, env) {
    var staticOptions = options.static;
    var dynamicOptions = options.dynamic;

    var STATE = {};

    GL_STATE_NAMES.forEach(function (prop) {
      var param = propName(prop);

      function parseParam (parseStatic, parseDynamic) {
        if (prop in staticOptions) {
          var value = parseStatic(staticOptions[prop]);
          STATE[param] = createStaticDecl(function () {
            return value
          });
        } else if (prop in dynamicOptions) {
          var dyn = dynamicOptions[prop];
          STATE[param] = createDynamicDecl(dyn, function (env, scope) {
            return parseDynamic(env, scope, env.invoke(scope, dyn))
          });
        }
      }

      switch (prop) {
        case S_CULL_ENABLE:
        case S_BLEND_ENABLE:
        case S_DITHER:
        case S_STENCIL_ENABLE:
        case S_DEPTH_ENABLE:
        case S_SCISSOR_ENABLE:
        case S_POLYGON_OFFSET_ENABLE:
        case S_SAMPLE_ALPHA:
        case S_SAMPLE_ENABLE:
        case S_DEPTH_MASK:
          return parseParam(
            function (value) {
              check$1.commandType(value, 'boolean', prop, env.commandStr);
              return value
            },
            function (env, scope, value) {
              check$1.optional(function () {
                env.assert(scope,
                  'typeof ' + value + '==="boolean"',
                  'invalid flag ' + prop, env.commandStr);
              });
              return value
            })

        case S_DEPTH_FUNC:
          return parseParam(
            function (value) {
              check$1.commandParameter(value, compareFuncs, 'invalid ' + prop, env.commandStr);
              return compareFuncs[value]
            },
            function (env, scope, value) {
              var COMPARE_FUNCS = env.constants.compareFuncs;
              check$1.optional(function () {
                env.assert(scope,
                  value + ' in ' + COMPARE_FUNCS,
                  'invalid ' + prop + ', must be one of ' + Object.keys(compareFuncs));
              });
              return scope.def(COMPARE_FUNCS, '[', value, ']')
            })

        case S_DEPTH_RANGE:
          return parseParam(
            function (value) {
              check$1.command(
                isArrayLike(value) &&
                value.length === 2 &&
                typeof value[0] === 'number' &&
                typeof value[1] === 'number' &&
                value[0] <= value[1],
                'depth range is 2d array',
                env.commandStr);
              return value
            },
            function (env, scope, value) {
              check$1.optional(function () {
                env.assert(scope,
                  env.shared.isArrayLike + '(' + value + ')&&' +
                  value + '.length===2&&' +
                  'typeof ' + value + '[0]==="number"&&' +
                  'typeof ' + value + '[1]==="number"&&' +
                  value + '[0]<=' + value + '[1]',
                  'depth range must be a 2d array');
              });

              var Z_NEAR = scope.def('+', value, '[0]');
              var Z_FAR = scope.def('+', value, '[1]');
              return [Z_NEAR, Z_FAR]
            })

        case S_BLEND_FUNC:
          return parseParam(
            function (value) {
              check$1.commandType(value, 'object', 'blend.func', env.commandStr);
              var srcRGB = ('srcRGB' in value ? value.srcRGB : value.src);
              var srcAlpha = ('srcAlpha' in value ? value.srcAlpha : value.src);
              var dstRGB = ('dstRGB' in value ? value.dstRGB : value.dst);
              var dstAlpha = ('dstAlpha' in value ? value.dstAlpha : value.dst);
              check$1.commandParameter(srcRGB, blendFuncs, param + '.srcRGB', env.commandStr);
              check$1.commandParameter(srcAlpha, blendFuncs, param + '.srcAlpha', env.commandStr);
              check$1.commandParameter(dstRGB, blendFuncs, param + '.dstRGB', env.commandStr);
              check$1.commandParameter(dstAlpha, blendFuncs, param + '.dstAlpha', env.commandStr);

              check$1.command(
                (invalidBlendCombinations.indexOf(srcRGB + ', ' + dstRGB) === -1),
                'unallowed blending combination (srcRGB, dstRGB) = (' + srcRGB + ', ' + dstRGB + ')', env.commandStr);

              return [
                blendFuncs[srcRGB],
                blendFuncs[dstRGB],
                blendFuncs[srcAlpha],
                blendFuncs[dstAlpha]
              ]
            },
            function (env, scope, value) {
              var BLEND_FUNCS = env.constants.blendFuncs;

              check$1.optional(function () {
                env.assert(scope,
                  value + '&&typeof ' + value + '==="object"',
                  'invalid blend func, must be an object');
              });

              function read (prefix, suffix) {
                var func = scope.def(
                  '"', prefix, suffix, '" in ', value,
                  '?', value, '.', prefix, suffix,
                  ':', value, '.', prefix);

                check$1.optional(function () {
                  env.assert(scope,
                    func + ' in ' + BLEND_FUNCS,
                    'invalid ' + prop + '.' + prefix + suffix + ', must be one of ' + Object.keys(blendFuncs));
                });

                return func
              }

              var srcRGB = read('src', 'RGB');
              var dstRGB = read('dst', 'RGB');

              check$1.optional(function () {
                var INVALID_BLEND_COMBINATIONS = env.constants.invalidBlendCombinations;

                env.assert(scope,
                           INVALID_BLEND_COMBINATIONS +
                           '.indexOf(' + srcRGB + '+", "+' + dstRGB + ') === -1 ',
                           'unallowed blending combination for (srcRGB, dstRGB)'
                          );
              });

              var SRC_RGB = scope.def(BLEND_FUNCS, '[', srcRGB, ']');
              var SRC_ALPHA = scope.def(BLEND_FUNCS, '[', read('src', 'Alpha'), ']');
              var DST_RGB = scope.def(BLEND_FUNCS, '[', dstRGB, ']');
              var DST_ALPHA = scope.def(BLEND_FUNCS, '[', read('dst', 'Alpha'), ']');

              return [SRC_RGB, DST_RGB, SRC_ALPHA, DST_ALPHA]
            })

        case S_BLEND_EQUATION:
          return parseParam(
            function (value) {
              if (typeof value === 'string') {
                check$1.commandParameter(value, blendEquations, 'invalid ' + prop, env.commandStr);
                return [
                  blendEquations[value],
                  blendEquations[value]
                ]
              } else if (typeof value === 'object') {
                check$1.commandParameter(
                  value.rgb, blendEquations, prop + '.rgb', env.commandStr);
                check$1.commandParameter(
                  value.alpha, blendEquations, prop + '.alpha', env.commandStr);
                return [
                  blendEquations[value.rgb],
                  blendEquations[value.alpha]
                ]
              } else {
                check$1.commandRaise('invalid blend.equation', env.commandStr);
              }
            },
            function (env, scope, value) {
              var BLEND_EQUATIONS = env.constants.blendEquations;

              var RGB = scope.def();
              var ALPHA = scope.def();

              var ifte = env.cond('typeof ', value, '==="string"');

              check$1.optional(function () {
                function checkProp (block, name, value) {
                  env.assert(block,
                    value + ' in ' + BLEND_EQUATIONS,
                    'invalid ' + name + ', must be one of ' + Object.keys(blendEquations));
                }
                checkProp(ifte.then, prop, value);

                env.assert(ifte.else,
                  value + '&&typeof ' + value + '==="object"',
                  'invalid ' + prop);
                checkProp(ifte.else, prop + '.rgb', value + '.rgb');
                checkProp(ifte.else, prop + '.alpha', value + '.alpha');
              });

              ifte.then(
                RGB, '=', ALPHA, '=', BLEND_EQUATIONS, '[', value, '];');
              ifte.else(
                RGB, '=', BLEND_EQUATIONS, '[', value, '.rgb];',
                ALPHA, '=', BLEND_EQUATIONS, '[', value, '.alpha];');

              scope(ifte);

              return [RGB, ALPHA]
            })

        case S_BLEND_COLOR:
          return parseParam(
            function (value) {
              check$1.command(
                isArrayLike(value) &&
                value.length === 4,
                'blend.color must be a 4d array', env.commandStr);
              return loop(4, function (i) {
                return +value[i]
              })
            },
            function (env, scope, value) {
              check$1.optional(function () {
                env.assert(scope,
                  env.shared.isArrayLike + '(' + value + ')&&' +
                  value + '.length===4',
                  'blend.color must be a 4d array');
              });
              return loop(4, function (i) {
                return scope.def('+', value, '[', i, ']')
              })
            })

        case S_STENCIL_MASK:
          return parseParam(
            function (value) {
              check$1.commandType(value, 'number', param, env.commandStr);
              return value | 0
            },
            function (env, scope, value) {
              check$1.optional(function () {
                env.assert(scope,
                  'typeof ' + value + '==="number"',
                  'invalid stencil.mask');
              });
              return scope.def(value, '|0')
            })

        case S_STENCIL_FUNC:
          return parseParam(
            function (value) {
              check$1.commandType(value, 'object', param, env.commandStr);
              var cmp = value.cmp || 'keep';
              var ref = value.ref || 0;
              var mask = 'mask' in value ? value.mask : -1;
              check$1.commandParameter(cmp, compareFuncs, prop + '.cmp', env.commandStr);
              check$1.commandType(ref, 'number', prop + '.ref', env.commandStr);
              check$1.commandType(mask, 'number', prop + '.mask', env.commandStr);
              return [
                compareFuncs[cmp],
                ref,
                mask
              ]
            },
            function (env, scope, value) {
              var COMPARE_FUNCS = env.constants.compareFuncs;
              check$1.optional(function () {
                function assert () {
                  env.assert(scope,
                    Array.prototype.join.call(arguments, ''),
                    'invalid stencil.func');
                }
                assert(value + '&&typeof ', value, '==="object"');
                assert('!("cmp" in ', value, ')||(',
                  value, '.cmp in ', COMPARE_FUNCS, ')');
              });
              var cmp = scope.def(
                '"cmp" in ', value,
                '?', COMPARE_FUNCS, '[', value, '.cmp]',
                ':', GL_KEEP);
              var ref = scope.def(value, '.ref|0');
              var mask = scope.def(
                '"mask" in ', value,
                '?', value, '.mask|0:-1');
              return [cmp, ref, mask]
            })

        case S_STENCIL_OPFRONT:
        case S_STENCIL_OPBACK:
          return parseParam(
            function (value) {
              check$1.commandType(value, 'object', param, env.commandStr);
              var fail = value.fail || 'keep';
              var zfail = value.zfail || 'keep';
              var zpass = value.zpass || 'keep';
              check$1.commandParameter(fail, stencilOps, prop + '.fail', env.commandStr);
              check$1.commandParameter(zfail, stencilOps, prop + '.zfail', env.commandStr);
              check$1.commandParameter(zpass, stencilOps, prop + '.zpass', env.commandStr);
              return [
                prop === S_STENCIL_OPBACK ? GL_BACK : GL_FRONT,
                stencilOps[fail],
                stencilOps[zfail],
                stencilOps[zpass]
              ]
            },
            function (env, scope, value) {
              var STENCIL_OPS = env.constants.stencilOps;

              check$1.optional(function () {
                env.assert(scope,
                  value + '&&typeof ' + value + '==="object"',
                  'invalid ' + prop);
              });

              function read (name) {
                check$1.optional(function () {
                  env.assert(scope,
                    '!("' + name + '" in ' + value + ')||' +
                    '(' + value + '.' + name + ' in ' + STENCIL_OPS + ')',
                    'invalid ' + prop + '.' + name + ', must be one of ' + Object.keys(stencilOps));
                });

                return scope.def(
                  '"', name, '" in ', value,
                  '?', STENCIL_OPS, '[', value, '.', name, ']:',
                  GL_KEEP)
              }

              return [
                prop === S_STENCIL_OPBACK ? GL_BACK : GL_FRONT,
                read('fail'),
                read('zfail'),
                read('zpass')
              ]
            })

        case S_POLYGON_OFFSET_OFFSET:
          return parseParam(
            function (value) {
              check$1.commandType(value, 'object', param, env.commandStr);
              var factor = value.factor | 0;
              var units = value.units | 0;
              check$1.commandType(factor, 'number', param + '.factor', env.commandStr);
              check$1.commandType(units, 'number', param + '.units', env.commandStr);
              return [factor, units]
            },
            function (env, scope, value) {
              check$1.optional(function () {
                env.assert(scope,
                  value + '&&typeof ' + value + '==="object"',
                  'invalid ' + prop);
              });

              var FACTOR = scope.def(value, '.factor|0');
              var UNITS = scope.def(value, '.units|0');

              return [FACTOR, UNITS]
            })

        case S_CULL_FACE:
          return parseParam(
            function (value) {
              var face = 0;
              if (value === 'front') {
                face = GL_FRONT;
              } else if (value === 'back') {
                face = GL_BACK;
              }
              check$1.command(!!face, param, env.commandStr);
              return face
            },
            function (env, scope, value) {
              check$1.optional(function () {
                env.assert(scope,
                  value + '==="front"||' +
                  value + '==="back"',
                  'invalid cull.face');
              });
              return scope.def(value, '==="front"?', GL_FRONT, ':', GL_BACK)
            })

        case S_LINE_WIDTH:
          return parseParam(
            function (value) {
              check$1.command(
                typeof value === 'number' &&
                value >= limits.lineWidthDims[0] &&
                value <= limits.lineWidthDims[1],
                'invalid line width, must be a positive number between ' +
                limits.lineWidthDims[0] + ' and ' + limits.lineWidthDims[1], env.commandStr);
              return value
            },
            function (env, scope, value) {
              check$1.optional(function () {
                env.assert(scope,
                  'typeof ' + value + '==="number"&&' +
                  value + '>=' + limits.lineWidthDims[0] + '&&' +
                  value + '<=' + limits.lineWidthDims[1],
                  'invalid line width');
              });

              return value
            })

        case S_FRONT_FACE:
          return parseParam(
            function (value) {
              check$1.commandParameter(value, orientationType, param, env.commandStr);
              return orientationType[value]
            },
            function (env, scope, value) {
              check$1.optional(function () {
                env.assert(scope,
                  value + '==="cw"||' +
                  value + '==="ccw"',
                  'invalid frontFace, must be one of cw,ccw');
              });
              return scope.def(value + '==="cw"?' + GL_CW + ':' + GL_CCW)
            })

        case S_COLOR_MASK:
          return parseParam(
            function (value) {
              check$1.command(
                isArrayLike(value) && value.length === 4,
                'color.mask must be length 4 array', env.commandStr);
              return value.map(function (v) { return !!v })
            },
            function (env, scope, value) {
              check$1.optional(function () {
                env.assert(scope,
                  env.shared.isArrayLike + '(' + value + ')&&' +
                  value + '.length===4',
                  'invalid color.mask');
              });
              return loop(4, function (i) {
                return '!!' + value + '[' + i + ']'
              })
            })

        case S_SAMPLE_COVERAGE:
          return parseParam(
            function (value) {
              check$1.command(typeof value === 'object' && value, param, env.commandStr);
              var sampleValue = 'value' in value ? value.value : 1;
              var sampleInvert = !!value.invert;
              check$1.command(
                typeof sampleValue === 'number' &&
                sampleValue >= 0 && sampleValue <= 1,
                'sample.coverage.value must be a number between 0 and 1', env.commandStr);
              return [sampleValue, sampleInvert]
            },
            function (env, scope, value) {
              check$1.optional(function () {
                env.assert(scope,
                  value + '&&typeof ' + value + '==="object"',
                  'invalid sample.coverage');
              });
              var VALUE = scope.def(
                '"value" in ', value, '?+', value, '.value:1');
              var INVERT = scope.def('!!', value, '.invert');
              return [VALUE, INVERT]
            })
      }
    });

    return STATE
  }

  function parseUniforms (uniforms, env) {
    var staticUniforms = uniforms.static;
    var dynamicUniforms = uniforms.dynamic;

    var UNIFORMS = {};

    Object.keys(staticUniforms).forEach(function (name) {
      var value = staticUniforms[name];
      var result;
      if (typeof value === 'number' ||
          typeof value === 'boolean') {
        result = createStaticDecl(function () {
          return value
        });
      } else if (typeof value === 'function') {
        var reglType = value._reglType;
        if (reglType === 'texture2d' ||
            reglType === 'textureCube') {
          result = createStaticDecl(function (env) {
            return env.link(value)
          });
        } else if (reglType === 'framebuffer' ||
                   reglType === 'framebufferCube') {
          check$1.command(value.color.length > 0,
            'missing color attachment for framebuffer sent to uniform "' + name + '"', env.commandStr);
          result = createStaticDecl(function (env) {
            return env.link(value.color[0])
          });
        } else {
          check$1.commandRaise('invalid data for uniform "' + name + '"', env.commandStr);
        }
      } else if (isArrayLike(value)) {
        result = createStaticDecl(function (env) {
          var ITEM = env.global.def('[',
            loop(value.length, function (i) {
              check$1.command(
                typeof value[i] === 'number' ||
                typeof value[i] === 'boolean',
                'invalid uniform ' + name, env.commandStr);
              return value[i]
            }), ']');
          return ITEM
        });
      } else {
        check$1.commandRaise('invalid or missing data for uniform "' + name + '"', env.commandStr);
      }
      result.value = value;
      UNIFORMS[name] = result;
    });

    Object.keys(dynamicUniforms).forEach(function (key) {
      var dyn = dynamicUniforms[key];
      UNIFORMS[key] = createDynamicDecl(dyn, function (env, scope) {
        return env.invoke(scope, dyn)
      });
    });

    return UNIFORMS
  }

  function parseAttributes (attributes, env) {
    var staticAttributes = attributes.static;
    var dynamicAttributes = attributes.dynamic;

    var attributeDefs = {};

    Object.keys(staticAttributes).forEach(function (attribute) {
      var value = staticAttributes[attribute];
      var id = stringStore.id(attribute);

      var record = new AttributeRecord();
      if (isBufferArgs(value)) {
        record.state = ATTRIB_STATE_POINTER;
        record.buffer = bufferState.getBuffer(
          bufferState.create(value, GL_ARRAY_BUFFER$1, false, true));
        record.type = 0;
      } else {
        var buffer = bufferState.getBuffer(value);
        if (buffer) {
          record.state = ATTRIB_STATE_POINTER;
          record.buffer = buffer;
          record.type = 0;
        } else {
          check$1.command(typeof value === 'object' && value,
            'invalid data for attribute ' + attribute, env.commandStr);
          if ('constant' in value) {
            var constant = value.constant;
            record.buffer = 'null';
            record.state = ATTRIB_STATE_CONSTANT;
            if (typeof constant === 'number') {
              record.x = constant;
            } else {
              check$1.command(
                isArrayLike(constant) &&
                constant.length > 0 &&
                constant.length <= 4,
                'invalid constant for attribute ' + attribute, env.commandStr);
              CUTE_COMPONENTS.forEach(function (c, i) {
                if (i < constant.length) {
                  record[c] = constant[i];
                }
              });
            }
          } else {
            if (isBufferArgs(value.buffer)) {
              buffer = bufferState.getBuffer(
                bufferState.create(value.buffer, GL_ARRAY_BUFFER$1, false, true));
            } else {
              buffer = bufferState.getBuffer(value.buffer);
            }
            check$1.command(!!buffer, 'missing buffer for attribute "' + attribute + '"', env.commandStr);

            var offset = value.offset | 0;
            check$1.command(offset >= 0,
              'invalid offset for attribute "' + attribute + '"', env.commandStr);

            var stride = value.stride | 0;
            check$1.command(stride >= 0 && stride < 256,
              'invalid stride for attribute "' + attribute + '", must be integer betweeen [0, 255]', env.commandStr);

            var size = value.size | 0;
            check$1.command(!('size' in value) || (size > 0 && size <= 4),
              'invalid size for attribute "' + attribute + '", must be 1,2,3,4', env.commandStr);

            var normalized = !!value.normalized;

            var type = 0;
            if ('type' in value) {
              check$1.commandParameter(
                value.type, glTypes,
                'invalid type for attribute ' + attribute, env.commandStr);
              type = glTypes[value.type];
            }

            var divisor = value.divisor | 0;
            if ('divisor' in value) {
              check$1.command(divisor === 0 || extInstancing,
                'cannot specify divisor for attribute "' + attribute + '", instancing not supported', env.commandStr);
              check$1.command(divisor >= 0,
                'invalid divisor for attribute "' + attribute + '"', env.commandStr);
            }

            check$1.optional(function () {
              var command = env.commandStr;

              var VALID_KEYS = [
                'buffer',
                'offset',
                'divisor',
                'normalized',
                'type',
                'size',
                'stride'
              ];

              Object.keys(value).forEach(function (prop) {
                check$1.command(
                  VALID_KEYS.indexOf(prop) >= 0,
                  'unknown parameter "' + prop + '" for attribute pointer "' + attribute + '" (valid parameters are ' + VALID_KEYS + ')',
                  command);
              });
            });

            record.buffer = buffer;
            record.state = ATTRIB_STATE_POINTER;
            record.size = size;
            record.normalized = normalized;
            record.type = type || buffer.dtype;
            record.offset = offset;
            record.stride = stride;
            record.divisor = divisor;
          }
        }
      }

      attributeDefs[attribute] = createStaticDecl(function (env, scope) {
        var cache = env.attribCache;
        if (id in cache) {
          return cache[id]
        }
        var result = {
          isStream: false
        };
        Object.keys(record).forEach(function (key) {
          result[key] = record[key];
        });
        if (record.buffer) {
          result.buffer = env.link(record.buffer);
          result.type = result.type || (result.buffer + '.dtype');
        }
        cache[id] = result;
        return result
      });
    });

    Object.keys(dynamicAttributes).forEach(function (attribute) {
      var dyn = dynamicAttributes[attribute];

      function appendAttributeCode (env, block) {
        var VALUE = env.invoke(block, dyn);

        var shared = env.shared;

        var IS_BUFFER_ARGS = shared.isBufferArgs;
        var BUFFER_STATE = shared.buffer;

        // Perform validation on attribute
        check$1.optional(function () {
          env.assert(block,
            VALUE + '&&(typeof ' + VALUE + '==="object"||typeof ' +
            VALUE + '==="function")&&(' +
            IS_BUFFER_ARGS + '(' + VALUE + ')||' +
            BUFFER_STATE + '.getBuffer(' + VALUE + ')||' +
            BUFFER_STATE + '.getBuffer(' + VALUE + '.buffer)||' +
            IS_BUFFER_ARGS + '(' + VALUE + '.buffer)||' +
            '("constant" in ' + VALUE +
            '&&(typeof ' + VALUE + '.constant==="number"||' +
            shared.isArrayLike + '(' + VALUE + '.constant))))',
            'invalid dynamic attribute "' + attribute + '"');
        });

        // allocate names for result
        var result = {
          isStream: block.def(false)
        };
        var defaultRecord = new AttributeRecord();
        defaultRecord.state = ATTRIB_STATE_POINTER;
        Object.keys(defaultRecord).forEach(function (key) {
          result[key] = block.def('' + defaultRecord[key]);
        });

        var BUFFER = result.buffer;
        var TYPE = result.type;
        block(
          'if(', IS_BUFFER_ARGS, '(', VALUE, ')){',
          result.isStream, '=true;',
          BUFFER, '=', BUFFER_STATE, '.createStream(', GL_ARRAY_BUFFER$1, ',', VALUE, ');',
          TYPE, '=', BUFFER, '.dtype;',
          '}else{',
          BUFFER, '=', BUFFER_STATE, '.getBuffer(', VALUE, ');',
          'if(', BUFFER, '){',
          TYPE, '=', BUFFER, '.dtype;',
          '}else if("constant" in ', VALUE, '){',
          result.state, '=', ATTRIB_STATE_CONSTANT, ';',
          'if(typeof ' + VALUE + '.constant === "number"){',
          result[CUTE_COMPONENTS[0]], '=', VALUE, '.constant;',
          CUTE_COMPONENTS.slice(1).map(function (n) {
            return result[n]
          }).join('='), '=0;',
          '}else{',
          CUTE_COMPONENTS.map(function (name, i) {
            return (
              result[name] + '=' + VALUE + '.constant.length>' + i +
              '?' + VALUE + '.constant[' + i + ']:0;'
            )
          }).join(''),
          '}}else{',
          'if(', IS_BUFFER_ARGS, '(', VALUE, '.buffer)){',
          BUFFER, '=', BUFFER_STATE, '.createStream(', GL_ARRAY_BUFFER$1, ',', VALUE, '.buffer);',
          '}else{',
          BUFFER, '=', BUFFER_STATE, '.getBuffer(', VALUE, '.buffer);',
          '}',
          TYPE, '="type" in ', VALUE, '?',
          shared.glTypes, '[', VALUE, '.type]:', BUFFER, '.dtype;',
          result.normalized, '=!!', VALUE, '.normalized;');
        function emitReadRecord (name) {
          block(result[name], '=', VALUE, '.', name, '|0;');
        }
        emitReadRecord('size');
        emitReadRecord('offset');
        emitReadRecord('stride');
        emitReadRecord('divisor');

        block('}}');

        block.exit(
          'if(', result.isStream, '){',
          BUFFER_STATE, '.destroyStream(', BUFFER, ');',
          '}');

        return result
      }

      attributeDefs[attribute] = createDynamicDecl(dyn, appendAttributeCode);
    });

    return attributeDefs
  }

  function parseContext (context) {
    var staticContext = context.static;
    var dynamicContext = context.dynamic;
    var result = {};

    Object.keys(staticContext).forEach(function (name) {
      var value = staticContext[name];
      result[name] = createStaticDecl(function (env, scope) {
        if (typeof value === 'number' || typeof value === 'boolean') {
          return '' + value
        } else {
          return env.link(value)
        }
      });
    });

    Object.keys(dynamicContext).forEach(function (name) {
      var dyn = dynamicContext[name];
      result[name] = createDynamicDecl(dyn, function (env, scope) {
        return env.invoke(scope, dyn)
      });
    });

    return result
  }

  function parseArguments (options, attributes, uniforms, context, env) {
    var staticOptions = options.static;
    var dynamicOptions = options.dynamic;

    check$1.optional(function () {
      var KEY_NAMES = [
        S_FRAMEBUFFER,
        S_VERT,
        S_FRAG,
        S_ELEMENTS,
        S_PRIMITIVE,
        S_OFFSET,
        S_COUNT,
        S_INSTANCES,
        S_PROFILE
      ].concat(GL_STATE_NAMES);

      function checkKeys (dict) {
        Object.keys(dict).forEach(function (key) {
          check$1.command(
            KEY_NAMES.indexOf(key) >= 0,
            'unknown parameter "' + key + '"',
            env.commandStr);
        });
      }

      checkKeys(staticOptions);
      checkKeys(dynamicOptions);
    });

    var framebuffer = parseFramebuffer(options, env);
    var viewportAndScissor = parseViewportScissor(options, framebuffer, env);
    var draw = parseDraw(options, env);
    var state = parseGLState(options, env);
    var shader = parseProgram(options, env);

    function copyBox (name) {
      var defn = viewportAndScissor[name];
      if (defn) {
        state[name] = defn;
      }
    }
    copyBox(S_VIEWPORT);
    copyBox(propName(S_SCISSOR_BOX));

    var dirty = Object.keys(state).length > 0;

    var result = {
      framebuffer: framebuffer,
      draw: draw,
      shader: shader,
      state: state,
      dirty: dirty
    };

    result.profile = parseProfile(options, env);
    result.uniforms = parseUniforms(uniforms, env);
    result.attributes = parseAttributes(attributes, env);
    result.context = parseContext(context, env);
    return result
  }

  // ===================================================
  // ===================================================
  // COMMON UPDATE FUNCTIONS
  // ===================================================
  // ===================================================
  function emitContext (env, scope, context) {
    var shared = env.shared;
    var CONTEXT = shared.context;

    var contextEnter = env.scope();

    Object.keys(context).forEach(function (name) {
      scope.save(CONTEXT, '.' + name);
      var defn = context[name];
      contextEnter(CONTEXT, '.', name, '=', defn.append(env, scope), ';');
    });

    scope(contextEnter);
  }

  // ===================================================
  // ===================================================
  // COMMON DRAWING FUNCTIONS
  // ===================================================
  // ===================================================
  function emitPollFramebuffer (env, scope, framebuffer, skipCheck) {
    var shared = env.shared;

    var GL = shared.gl;
    var FRAMEBUFFER_STATE = shared.framebuffer;
    var EXT_DRAW_BUFFERS;
    if (extDrawBuffers) {
      EXT_DRAW_BUFFERS = scope.def(shared.extensions, '.webgl_draw_buffers');
    }

    var constants = env.constants;

    var DRAW_BUFFERS = constants.drawBuffer;
    var BACK_BUFFER = constants.backBuffer;

    var NEXT;
    if (framebuffer) {
      NEXT = framebuffer.append(env, scope);
    } else {
      NEXT = scope.def(FRAMEBUFFER_STATE, '.next');
    }

    if (!skipCheck) {
      scope('if(', NEXT, '!==', FRAMEBUFFER_STATE, '.cur){');
    }
    scope(
      'if(', NEXT, '){',
      GL, '.bindFramebuffer(', GL_FRAMEBUFFER$2, ',', NEXT, '.framebuffer);');
    if (extDrawBuffers) {
      scope(EXT_DRAW_BUFFERS, '.drawBuffersWEBGL(',
        DRAW_BUFFERS, '[', NEXT, '.colorAttachments.length]);');
    }
    scope('}else{',
      GL, '.bindFramebuffer(', GL_FRAMEBUFFER$2, ',null);');
    if (extDrawBuffers) {
      scope(EXT_DRAW_BUFFERS, '.drawBuffersWEBGL(', BACK_BUFFER, ');');
    }
    scope(
      '}',
      FRAMEBUFFER_STATE, '.cur=', NEXT, ';');
    if (!skipCheck) {
      scope('}');
    }
  }

  function emitPollState (env, scope, args) {
    var shared = env.shared;

    var GL = shared.gl;

    var CURRENT_VARS = env.current;
    var NEXT_VARS = env.next;
    var CURRENT_STATE = shared.current;
    var NEXT_STATE = shared.next;

    var block = env.cond(CURRENT_STATE, '.dirty');

    GL_STATE_NAMES.forEach(function (prop) {
      var param = propName(prop);
      if (param in args.state) {
        return
      }

      var NEXT, CURRENT;
      if (param in NEXT_VARS) {
        NEXT = NEXT_VARS[param];
        CURRENT = CURRENT_VARS[param];
        var parts = loop(currentState[param].length, function (i) {
          return block.def(NEXT, '[', i, ']')
        });
        block(env.cond(parts.map(function (p, i) {
          return p + '!==' + CURRENT + '[' + i + ']'
        }).join('||'))
          .then(
            GL, '.', GL_VARIABLES[param], '(', parts, ');',
            parts.map(function (p, i) {
              return CURRENT + '[' + i + ']=' + p
            }).join(';'), ';'));
      } else {
        NEXT = block.def(NEXT_STATE, '.', param);
        var ifte = env.cond(NEXT, '!==', CURRENT_STATE, '.', param);
        block(ifte);
        if (param in GL_FLAGS) {
          ifte(
            env.cond(NEXT)
                .then(GL, '.enable(', GL_FLAGS[param], ');')
                .else(GL, '.disable(', GL_FLAGS[param], ');'),
            CURRENT_STATE, '.', param, '=', NEXT, ';');
        } else {
          ifte(
            GL, '.', GL_VARIABLES[param], '(', NEXT, ');',
            CURRENT_STATE, '.', param, '=', NEXT, ';');
        }
      }
    });
    if (Object.keys(args.state).length === 0) {
      block(CURRENT_STATE, '.dirty=false;');
    }
    scope(block);
  }

  function emitSetOptions (env, scope, options, filter) {
    var shared = env.shared;
    var CURRENT_VARS = env.current;
    var CURRENT_STATE = shared.current;
    var GL = shared.gl;
    sortState(Object.keys(options)).forEach(function (param) {
      var defn = options[param];
      if (filter && !filter(defn)) {
        return
      }
      var variable = defn.append(env, scope);
      if (GL_FLAGS[param]) {
        var flag = GL_FLAGS[param];
        if (isStatic(defn)) {
          if (variable) {
            scope(GL, '.enable(', flag, ');');
          } else {
            scope(GL, '.disable(', flag, ');');
          }
        } else {
          scope(env.cond(variable)
            .then(GL, '.enable(', flag, ');')
            .else(GL, '.disable(', flag, ');'));
        }
        scope(CURRENT_STATE, '.', param, '=', variable, ';');
      } else if (isArrayLike(variable)) {
        var CURRENT = CURRENT_VARS[param];
        scope(
          GL, '.', GL_VARIABLES[param], '(', variable, ');',
          variable.map(function (v, i) {
            return CURRENT + '[' + i + ']=' + v
          }).join(';'), ';');
      } else {
        scope(
          GL, '.', GL_VARIABLES[param], '(', variable, ');',
          CURRENT_STATE, '.', param, '=', variable, ';');
      }
    });
  }

  function injectExtensions (env, scope) {
    if (extInstancing) {
      env.instancing = scope.def(
        env.shared.extensions, '.angle_instanced_arrays');
    }
  }

  function emitProfile (env, scope, args, useScope, incrementCounter) {
    var shared = env.shared;
    var STATS = env.stats;
    var CURRENT_STATE = shared.current;
    var TIMER = shared.timer;
    var profileArg = args.profile;

    function perfCounter () {
      if (typeof performance === 'undefined') {
        return 'Date.now()'
      } else {
        return 'performance.now()'
      }
    }

    var CPU_START, QUERY_COUNTER;
    function emitProfileStart (block) {
      CPU_START = scope.def();
      block(CPU_START, '=', perfCounter(), ';');
      if (typeof incrementCounter === 'string') {
        block(STATS, '.count+=', incrementCounter, ';');
      } else {
        block(STATS, '.count++;');
      }
      if (timer) {
        if (useScope) {
          QUERY_COUNTER = scope.def();
          block(QUERY_COUNTER, '=', TIMER, '.getNumPendingQueries();');
        } else {
          block(TIMER, '.beginQuery(', STATS, ');');
        }
      }
    }

    function emitProfileEnd (block) {
      block(STATS, '.cpuTime+=', perfCounter(), '-', CPU_START, ';');
      if (timer) {
        if (useScope) {
          block(TIMER, '.pushScopeStats(',
            QUERY_COUNTER, ',',
            TIMER, '.getNumPendingQueries(),',
            STATS, ');');
        } else {
          block(TIMER, '.endQuery();');
        }
      }
    }

    function scopeProfile (value) {
      var prev = scope.def(CURRENT_STATE, '.profile');
      scope(CURRENT_STATE, '.profile=', value, ';');
      scope.exit(CURRENT_STATE, '.profile=', prev, ';');
    }

    var USE_PROFILE;
    if (profileArg) {
      if (isStatic(profileArg)) {
        if (profileArg.enable) {
          emitProfileStart(scope);
          emitProfileEnd(scope.exit);
          scopeProfile('true');
        } else {
          scopeProfile('false');
        }
        return
      }
      USE_PROFILE = profileArg.append(env, scope);
      scopeProfile(USE_PROFILE);
    } else {
      USE_PROFILE = scope.def(CURRENT_STATE, '.profile');
    }

    var start = env.block();
    emitProfileStart(start);
    scope('if(', USE_PROFILE, '){', start, '}');
    var end = env.block();
    emitProfileEnd(end);
    scope.exit('if(', USE_PROFILE, '){', end, '}');
  }

  function emitAttributes (env, scope, args, attributes, filter) {
    var shared = env.shared;

    function typeLength (x) {
      switch (x) {
        case GL_FLOAT_VEC2:
        case GL_INT_VEC2:
        case GL_BOOL_VEC2:
          return 2
        case GL_FLOAT_VEC3:
        case GL_INT_VEC3:
        case GL_BOOL_VEC3:
          return 3
        case GL_FLOAT_VEC4:
        case GL_INT_VEC4:
        case GL_BOOL_VEC4:
          return 4
        default:
          return 1
      }
    }

    function emitBindAttribute (ATTRIBUTE, size, record) {
      var GL = shared.gl;

      var LOCATION = scope.def(ATTRIBUTE, '.location');
      var BINDING = scope.def(shared.attributes, '[', LOCATION, ']');

      var STATE = record.state;
      var BUFFER = record.buffer;
      var CONST_COMPONENTS = [
        record.x,
        record.y,
        record.z,
        record.w
      ];

      var COMMON_KEYS = [
        'buffer',
        'normalized',
        'offset',
        'stride'
      ];

      function emitBuffer () {
        scope(
          'if(!', BINDING, '.buffer){',
          GL, '.enableVertexAttribArray(', LOCATION, ');}');

        var TYPE = record.type;
        var SIZE;
        if (!record.size) {
          SIZE = size;
        } else {
          SIZE = scope.def(record.size, '||', size);
        }

        scope('if(',
          BINDING, '.type!==', TYPE, '||',
          BINDING, '.size!==', SIZE, '||',
          COMMON_KEYS.map(function (key) {
            return BINDING + '.' + key + '!==' + record[key]
          }).join('||'),
          '){',
          GL, '.bindBuffer(', GL_ARRAY_BUFFER$1, ',', BUFFER, '.buffer);',
          GL, '.vertexAttribPointer(', [
            LOCATION,
            SIZE,
            TYPE,
            record.normalized,
            record.stride,
            record.offset
          ], ');',
          BINDING, '.type=', TYPE, ';',
          BINDING, '.size=', SIZE, ';',
          COMMON_KEYS.map(function (key) {
            return BINDING + '.' + key + '=' + record[key] + ';'
          }).join(''),
          '}');

        if (extInstancing) {
          var DIVISOR = record.divisor;
          scope(
            'if(', BINDING, '.divisor!==', DIVISOR, '){',
            env.instancing, '.vertexAttribDivisorANGLE(', [LOCATION, DIVISOR], ');',
            BINDING, '.divisor=', DIVISOR, ';}');
        }
      }

      function emitConstant () {
        scope(
          'if(', BINDING, '.buffer){',
          GL, '.disableVertexAttribArray(', LOCATION, ');',
          '}if(', CUTE_COMPONENTS.map(function (c, i) {
            return BINDING + '.' + c + '!==' + CONST_COMPONENTS[i]
          }).join('||'), '){',
          GL, '.vertexAttrib4f(', LOCATION, ',', CONST_COMPONENTS, ');',
          CUTE_COMPONENTS.map(function (c, i) {
            return BINDING + '.' + c + '=' + CONST_COMPONENTS[i] + ';'
          }).join(''),
          '}');
      }

      if (STATE === ATTRIB_STATE_POINTER) {
        emitBuffer();
      } else if (STATE === ATTRIB_STATE_CONSTANT) {
        emitConstant();
      } else {
        scope('if(', STATE, '===', ATTRIB_STATE_POINTER, '){');
        emitBuffer();
        scope('}else{');
        emitConstant();
        scope('}');
      }
    }

    attributes.forEach(function (attribute) {
      var name = attribute.name;
      var arg = args.attributes[name];
      var record;
      if (arg) {
        if (!filter(arg)) {
          return
        }
        record = arg.append(env, scope);
      } else {
        if (!filter(SCOPE_DECL)) {
          return
        }
        var scopeAttrib = env.scopeAttrib(name);
        check$1.optional(function () {
          env.assert(scope,
            scopeAttrib + '.state',
            'missing attribute ' + name);
        });
        record = {};
        Object.keys(new AttributeRecord()).forEach(function (key) {
          record[key] = scope.def(scopeAttrib, '.', key);
        });
      }
      emitBindAttribute(
        env.link(attribute), typeLength(attribute.info.type), record);
    });
  }

  function emitUniforms (env, scope, args, uniforms, filter) {
    var shared = env.shared;
    var GL = shared.gl;

    var infix;
    for (var i = 0; i < uniforms.length; ++i) {
      var uniform = uniforms[i];
      var name = uniform.name;
      var type = uniform.info.type;
      var arg = args.uniforms[name];
      var UNIFORM = env.link(uniform);
      var LOCATION = UNIFORM + '.location';

      var VALUE;
      if (arg) {
        if (!filter(arg)) {
          continue
        }
        if (isStatic(arg)) {
          var value = arg.value;
          check$1.command(
            value !== null && typeof value !== 'undefined',
            'missing uniform "' + name + '"', env.commandStr);
          if (type === GL_SAMPLER_2D || type === GL_SAMPLER_CUBE) {
            check$1.command(
              typeof value === 'function' &&
              ((type === GL_SAMPLER_2D &&
                (value._reglType === 'texture2d' ||
                value._reglType === 'framebuffer')) ||
              (type === GL_SAMPLER_CUBE &&
                (value._reglType === 'textureCube' ||
                value._reglType === 'framebufferCube'))),
              'invalid texture for uniform ' + name, env.commandStr);
            var TEX_VALUE = env.link(value._texture || value.color[0]._texture);
            scope(GL, '.uniform1i(', LOCATION, ',', TEX_VALUE + '.bind());');
            scope.exit(TEX_VALUE, '.unbind();');
          } else if (
            type === GL_FLOAT_MAT2 ||
            type === GL_FLOAT_MAT3 ||
            type === GL_FLOAT_MAT4) {
            check$1.optional(function () {
              check$1.command(isArrayLike(value),
                'invalid matrix for uniform ' + name, env.commandStr);
              check$1.command(
                (type === GL_FLOAT_MAT2 && value.length === 4) ||
                (type === GL_FLOAT_MAT3 && value.length === 9) ||
                (type === GL_FLOAT_MAT4 && value.length === 16),
                'invalid length for matrix uniform ' + name, env.commandStr);
            });
            var MAT_VALUE = env.global.def('new Float32Array([' +
              Array.prototype.slice.call(value) + '])');
            var dim = 2;
            if (type === GL_FLOAT_MAT3) {
              dim = 3;
            } else if (type === GL_FLOAT_MAT4) {
              dim = 4;
            }
            scope(
              GL, '.uniformMatrix', dim, 'fv(',
              LOCATION, ',false,', MAT_VALUE, ');');
          } else {
            switch (type) {
              case GL_FLOAT$8:
                check$1.commandType(value, 'number', 'uniform ' + name, env.commandStr);
                infix = '1f';
                break
              case GL_FLOAT_VEC2:
                check$1.command(
                  isArrayLike(value) && value.length === 2,
                  'uniform ' + name, env.commandStr);
                infix = '2f';
                break
              case GL_FLOAT_VEC3:
                check$1.command(
                  isArrayLike(value) && value.length === 3,
                  'uniform ' + name, env.commandStr);
                infix = '3f';
                break
              case GL_FLOAT_VEC4:
                check$1.command(
                  isArrayLike(value) && value.length === 4,
                  'uniform ' + name, env.commandStr);
                infix = '4f';
                break
              case GL_BOOL:
                check$1.commandType(value, 'boolean', 'uniform ' + name, env.commandStr);
                infix = '1i';
                break
              case GL_INT$3:
                check$1.commandType(value, 'number', 'uniform ' + name, env.commandStr);
                infix = '1i';
                break
              case GL_BOOL_VEC2:
                check$1.command(
                  isArrayLike(value) && value.length === 2,
                  'uniform ' + name, env.commandStr);
                infix = '2i';
                break
              case GL_INT_VEC2:
                check$1.command(
                  isArrayLike(value) && value.length === 2,
                  'uniform ' + name, env.commandStr);
                infix = '2i';
                break
              case GL_BOOL_VEC3:
                check$1.command(
                  isArrayLike(value) && value.length === 3,
                  'uniform ' + name, env.commandStr);
                infix = '3i';
                break
              case GL_INT_VEC3:
                check$1.command(
                  isArrayLike(value) && value.length === 3,
                  'uniform ' + name, env.commandStr);
                infix = '3i';
                break
              case GL_BOOL_VEC4:
                check$1.command(
                  isArrayLike(value) && value.length === 4,
                  'uniform ' + name, env.commandStr);
                infix = '4i';
                break
              case GL_INT_VEC4:
                check$1.command(
                  isArrayLike(value) && value.length === 4,
                  'uniform ' + name, env.commandStr);
                infix = '4i';
                break
            }
            scope(GL, '.uniform', infix, '(', LOCATION, ',',
              isArrayLike(value) ? Array.prototype.slice.call(value) : value,
              ');');
          }
          continue
        } else {
          VALUE = arg.append(env, scope);
        }
      } else {
        if (!filter(SCOPE_DECL)) {
          continue
        }
        VALUE = scope.def(shared.uniforms, '[', stringStore.id(name), ']');
      }

      if (type === GL_SAMPLER_2D) {
        scope(
          'if(', VALUE, '&&', VALUE, '._reglType==="framebuffer"){',
          VALUE, '=', VALUE, '.color[0];',
          '}');
      } else if (type === GL_SAMPLER_CUBE) {
        scope(
          'if(', VALUE, '&&', VALUE, '._reglType==="framebufferCube"){',
          VALUE, '=', VALUE, '.color[0];',
          '}');
      }

      // perform type validation
      check$1.optional(function () {
        function check (pred, message) {
          env.assert(scope, pred,
            'bad data or missing for uniform "' + name + '".  ' + message);
        }

        function checkType (type) {
          check(
            'typeof ' + VALUE + '==="' + type + '"',
            'invalid type, expected ' + type);
        }

        function checkVector (n, type) {
          check(
            shared.isArrayLike + '(' + VALUE + ')&&' + VALUE + '.length===' + n,
            'invalid vector, should have length ' + n, env.commandStr);
        }

        function checkTexture (target) {
          check(
            'typeof ' + VALUE + '==="function"&&' +
            VALUE + '._reglType==="texture' +
            (target === GL_TEXTURE_2D$3 ? '2d' : 'Cube') + '"',
            'invalid texture type', env.commandStr);
        }

        switch (type) {
          case GL_INT$3:
            checkType('number');
            break
          case GL_INT_VEC2:
            checkVector(2, 'number');
            break
          case GL_INT_VEC3:
            checkVector(3, 'number');
            break
          case GL_INT_VEC4:
            checkVector(4, 'number');
            break
          case GL_FLOAT$8:
            checkType('number');
            break
          case GL_FLOAT_VEC2:
            checkVector(2, 'number');
            break
          case GL_FLOAT_VEC3:
            checkVector(3, 'number');
            break
          case GL_FLOAT_VEC4:
            checkVector(4, 'number');
            break
          case GL_BOOL:
            checkType('boolean');
            break
          case GL_BOOL_VEC2:
            checkVector(2, 'boolean');
            break
          case GL_BOOL_VEC3:
            checkVector(3, 'boolean');
            break
          case GL_BOOL_VEC4:
            checkVector(4, 'boolean');
            break
          case GL_FLOAT_MAT2:
            checkVector(4, 'number');
            break
          case GL_FLOAT_MAT3:
            checkVector(9, 'number');
            break
          case GL_FLOAT_MAT4:
            checkVector(16, 'number');
            break
          case GL_SAMPLER_2D:
            checkTexture(GL_TEXTURE_2D$3);
            break
          case GL_SAMPLER_CUBE:
            checkTexture(GL_TEXTURE_CUBE_MAP$2);
            break
        }
      });

      var unroll = 1;
      switch (type) {
        case GL_SAMPLER_2D:
        case GL_SAMPLER_CUBE:
          var TEX = scope.def(VALUE, '._texture');
          scope(GL, '.uniform1i(', LOCATION, ',', TEX, '.bind());');
          scope.exit(TEX, '.unbind();');
          continue

        case GL_INT$3:
        case GL_BOOL:
          infix = '1i';
          break

        case GL_INT_VEC2:
        case GL_BOOL_VEC2:
          infix = '2i';
          unroll = 2;
          break

        case GL_INT_VEC3:
        case GL_BOOL_VEC3:
          infix = '3i';
          unroll = 3;
          break

        case GL_INT_VEC4:
        case GL_BOOL_VEC4:
          infix = '4i';
          unroll = 4;
          break

        case GL_FLOAT$8:
          infix = '1f';
          break

        case GL_FLOAT_VEC2:
          infix = '2f';
          unroll = 2;
          break

        case GL_FLOAT_VEC3:
          infix = '3f';
          unroll = 3;
          break

        case GL_FLOAT_VEC4:
          infix = '4f';
          unroll = 4;
          break

        case GL_FLOAT_MAT2:
          infix = 'Matrix2fv';
          break

        case GL_FLOAT_MAT3:
          infix = 'Matrix3fv';
          break

        case GL_FLOAT_MAT4:
          infix = 'Matrix4fv';
          break
      }

      scope(GL, '.uniform', infix, '(', LOCATION, ',');
      if (infix.charAt(0) === 'M') {
        var matSize = Math.pow(type - GL_FLOAT_MAT2 + 2, 2);
        var STORAGE = env.global.def('new Float32Array(', matSize, ')');
        scope(
          'false,(Array.isArray(', VALUE, ')||', VALUE, ' instanceof Float32Array)?', VALUE, ':(',
          loop(matSize, function (i) {
            return STORAGE + '[' + i + ']=' + VALUE + '[' + i + ']'
          }), ',', STORAGE, ')');
      } else if (unroll > 1) {
        scope(loop(unroll, function (i) {
          return VALUE + '[' + i + ']'
        }));
      } else {
        scope(VALUE);
      }
      scope(');');
    }
  }

  function emitDraw (env, outer, inner, args) {
    var shared = env.shared;
    var GL = shared.gl;
    var DRAW_STATE = shared.draw;

    var drawOptions = args.draw;

    function emitElements () {
      var defn = drawOptions.elements;
      var ELEMENTS;
      var scope = outer;
      if (defn) {
        if ((defn.contextDep && args.contextDynamic) || defn.propDep) {
          scope = inner;
        }
        ELEMENTS = defn.append(env, scope);
      } else {
        ELEMENTS = scope.def(DRAW_STATE, '.', S_ELEMENTS);
      }
      if (ELEMENTS) {
        scope(
          'if(' + ELEMENTS + ')' +
          GL + '.bindBuffer(' + GL_ELEMENT_ARRAY_BUFFER$1 + ',' + ELEMENTS + '.buffer.buffer);');
      }
      return ELEMENTS
    }

    function emitCount () {
      var defn = drawOptions.count;
      var COUNT;
      var scope = outer;
      if (defn) {
        if ((defn.contextDep && args.contextDynamic) || defn.propDep) {
          scope = inner;
        }
        COUNT = defn.append(env, scope);
        check$1.optional(function () {
          if (defn.MISSING) {
            env.assert(outer, 'false', 'missing vertex count');
          }
          if (defn.DYNAMIC) {
            env.assert(scope, COUNT + '>=0', 'missing vertex count');
          }
        });
      } else {
        COUNT = scope.def(DRAW_STATE, '.', S_COUNT);
        check$1.optional(function () {
          env.assert(scope, COUNT + '>=0', 'missing vertex count');
        });
      }
      return COUNT
    }

    var ELEMENTS = emitElements();
    function emitValue (name) {
      var defn = drawOptions[name];
      if (defn) {
        if ((defn.contextDep && args.contextDynamic) || defn.propDep) {
          return defn.append(env, inner)
        } else {
          return defn.append(env, outer)
        }
      } else {
        return outer.def(DRAW_STATE, '.', name)
      }
    }

    var PRIMITIVE = emitValue(S_PRIMITIVE);
    var OFFSET = emitValue(S_OFFSET);

    var COUNT = emitCount();
    if (typeof COUNT === 'number') {
      if (COUNT === 0) {
        return
      }
    } else {
      inner('if(', COUNT, '){');
      inner.exit('}');
    }

    var INSTANCES, EXT_INSTANCING;
    if (extInstancing) {
      INSTANCES = emitValue(S_INSTANCES);
      EXT_INSTANCING = env.instancing;
    }

    var ELEMENT_TYPE = ELEMENTS + '.type';

    var elementsStatic = drawOptions.elements && isStatic(drawOptions.elements);

    function emitInstancing () {
      function drawElements () {
        inner(EXT_INSTANCING, '.drawElementsInstancedANGLE(', [
          PRIMITIVE,
          COUNT,
          ELEMENT_TYPE,
          OFFSET + '<<((' + ELEMENT_TYPE + '-' + GL_UNSIGNED_BYTE$8 + ')>>1)',
          INSTANCES
        ], ');');
      }

      function drawArrays () {
        inner(EXT_INSTANCING, '.drawArraysInstancedANGLE(',
          [PRIMITIVE, OFFSET, COUNT, INSTANCES], ');');
      }

      if (ELEMENTS) {
        if (!elementsStatic) {
          inner('if(', ELEMENTS, '){');
          drawElements();
          inner('}else{');
          drawArrays();
          inner('}');
        } else {
          drawElements();
        }
      } else {
        drawArrays();
      }
    }

    function emitRegular () {
      function drawElements () {
        inner(GL + '.drawElements(' + [
          PRIMITIVE,
          COUNT,
          ELEMENT_TYPE,
          OFFSET + '<<((' + ELEMENT_TYPE + '-' + GL_UNSIGNED_BYTE$8 + ')>>1)'
        ] + ');');
      }

      function drawArrays () {
        inner(GL + '.drawArrays(' + [PRIMITIVE, OFFSET, COUNT] + ');');
      }

      if (ELEMENTS) {
        if (!elementsStatic) {
          inner('if(', ELEMENTS, '){');
          drawElements();
          inner('}else{');
          drawArrays();
          inner('}');
        } else {
          drawElements();
        }
      } else {
        drawArrays();
      }
    }

    if (extInstancing && (typeof INSTANCES !== 'number' || INSTANCES >= 0)) {
      if (typeof INSTANCES === 'string') {
        inner('if(', INSTANCES, '>0){');
        emitInstancing();
        inner('}else if(', INSTANCES, '<0){');
        emitRegular();
        inner('}');
      } else {
        emitInstancing();
      }
    } else {
      emitRegular();
    }
  }

  function createBody (emitBody, parentEnv, args, program, count) {
    var env = createREGLEnvironment();
    var scope = env.proc('body', count);
    check$1.optional(function () {
      env.commandStr = parentEnv.commandStr;
      env.command = env.link(parentEnv.commandStr);
    });
    if (extInstancing) {
      env.instancing = scope.def(
        env.shared.extensions, '.angle_instanced_arrays');
    }
    emitBody(env, scope, args, program);
    return env.compile().body
  }

  // ===================================================
  // ===================================================
  // DRAW PROC
  // ===================================================
  // ===================================================
  function emitDrawBody (env, draw, args, program) {
    injectExtensions(env, draw);
    emitAttributes(env, draw, args, program.attributes, function () {
      return true
    });
    emitUniforms(env, draw, args, program.uniforms, function () {
      return true
    });
    emitDraw(env, draw, draw, args);
  }

  function emitDrawProc (env, args) {
    var draw = env.proc('draw', 1);

    injectExtensions(env, draw);

    emitContext(env, draw, args.context);
    emitPollFramebuffer(env, draw, args.framebuffer);

    emitPollState(env, draw, args);
    emitSetOptions(env, draw, args.state);

    emitProfile(env, draw, args, false, true);

    var program = args.shader.progVar.append(env, draw);
    draw(env.shared.gl, '.useProgram(', program, '.program);');

    if (args.shader.program) {
      emitDrawBody(env, draw, args, args.shader.program);
    } else {
      var drawCache = env.global.def('{}');
      var PROG_ID = draw.def(program, '.id');
      var CACHED_PROC = draw.def(drawCache, '[', PROG_ID, ']');
      draw(
        env.cond(CACHED_PROC)
          .then(CACHED_PROC, '.call(this,a0);')
          .else(
            CACHED_PROC, '=', drawCache, '[', PROG_ID, ']=',
            env.link(function (program) {
              return createBody(emitDrawBody, env, args, program, 1)
            }), '(', program, ');',
            CACHED_PROC, '.call(this,a0);'));
    }

    if (Object.keys(args.state).length > 0) {
      draw(env.shared.current, '.dirty=true;');
    }
  }

  // ===================================================
  // ===================================================
  // BATCH PROC
  // ===================================================
  // ===================================================

  function emitBatchDynamicShaderBody (env, scope, args, program) {
    env.batchId = 'a1';

    injectExtensions(env, scope);

    function all () {
      return true
    }

    emitAttributes(env, scope, args, program.attributes, all);
    emitUniforms(env, scope, args, program.uniforms, all);
    emitDraw(env, scope, scope, args);
  }

  function emitBatchBody (env, scope, args, program) {
    injectExtensions(env, scope);

    var contextDynamic = args.contextDep;

    var BATCH_ID = scope.def();
    var PROP_LIST = 'a0';
    var NUM_PROPS = 'a1';
    var PROPS = scope.def();
    env.shared.props = PROPS;
    env.batchId = BATCH_ID;

    var outer = env.scope();
    var inner = env.scope();

    scope(
      outer.entry,
      'for(', BATCH_ID, '=0;', BATCH_ID, '<', NUM_PROPS, ';++', BATCH_ID, '){',
      PROPS, '=', PROP_LIST, '[', BATCH_ID, '];',
      inner,
      '}',
      outer.exit);

    function isInnerDefn (defn) {
      return ((defn.contextDep && contextDynamic) || defn.propDep)
    }

    function isOuterDefn (defn) {
      return !isInnerDefn(defn)
    }

    if (args.needsContext) {
      emitContext(env, inner, args.context);
    }
    if (args.needsFramebuffer) {
      emitPollFramebuffer(env, inner, args.framebuffer);
    }
    emitSetOptions(env, inner, args.state, isInnerDefn);

    if (args.profile && isInnerDefn(args.profile)) {
      emitProfile(env, inner, args, false, true);
    }

    if (!program) {
      var progCache = env.global.def('{}');
      var PROGRAM = args.shader.progVar.append(env, inner);
      var PROG_ID = inner.def(PROGRAM, '.id');
      var CACHED_PROC = inner.def(progCache, '[', PROG_ID, ']');
      inner(
        env.shared.gl, '.useProgram(', PROGRAM, '.program);',
        'if(!', CACHED_PROC, '){',
        CACHED_PROC, '=', progCache, '[', PROG_ID, ']=',
        env.link(function (program) {
          return createBody(
            emitBatchDynamicShaderBody, env, args, program, 2)
        }), '(', PROGRAM, ');}',
        CACHED_PROC, '.call(this,a0[', BATCH_ID, '],', BATCH_ID, ');');
    } else {
      emitAttributes(env, outer, args, program.attributes, isOuterDefn);
      emitAttributes(env, inner, args, program.attributes, isInnerDefn);
      emitUniforms(env, outer, args, program.uniforms, isOuterDefn);
      emitUniforms(env, inner, args, program.uniforms, isInnerDefn);
      emitDraw(env, outer, inner, args);
    }
  }

  function emitBatchProc (env, args) {
    var batch = env.proc('batch', 2);
    env.batchId = '0';

    injectExtensions(env, batch);

    // Check if any context variables depend on props
    var contextDynamic = false;
    var needsContext = true;
    Object.keys(args.context).forEach(function (name) {
      contextDynamic = contextDynamic || args.context[name].propDep;
    });
    if (!contextDynamic) {
      emitContext(env, batch, args.context);
      needsContext = false;
    }

    // framebuffer state affects framebufferWidth/height context vars
    var framebuffer = args.framebuffer;
    var needsFramebuffer = false;
    if (framebuffer) {
      if (framebuffer.propDep) {
        contextDynamic = needsFramebuffer = true;
      } else if (framebuffer.contextDep && contextDynamic) {
        needsFramebuffer = true;
      }
      if (!needsFramebuffer) {
        emitPollFramebuffer(env, batch, framebuffer);
      }
    } else {
      emitPollFramebuffer(env, batch, null);
    }

    // viewport is weird because it can affect context vars
    if (args.state.viewport && args.state.viewport.propDep) {
      contextDynamic = true;
    }

    function isInnerDefn (defn) {
      return (defn.contextDep && contextDynamic) || defn.propDep
    }

    // set webgl options
    emitPollState(env, batch, args);
    emitSetOptions(env, batch, args.state, function (defn) {
      return !isInnerDefn(defn)
    });

    if (!args.profile || !isInnerDefn(args.profile)) {
      emitProfile(env, batch, args, false, 'a1');
    }

    // Save these values to args so that the batch body routine can use them
    args.contextDep = contextDynamic;
    args.needsContext = needsContext;
    args.needsFramebuffer = needsFramebuffer;

    // determine if shader is dynamic
    var progDefn = args.shader.progVar;
    if ((progDefn.contextDep && contextDynamic) || progDefn.propDep) {
      emitBatchBody(
        env,
        batch,
        args,
        null);
    } else {
      var PROGRAM = progDefn.append(env, batch);
      batch(env.shared.gl, '.useProgram(', PROGRAM, '.program);');
      if (args.shader.program) {
        emitBatchBody(
          env,
          batch,
          args,
          args.shader.program);
      } else {
        var batchCache = env.global.def('{}');
        var PROG_ID = batch.def(PROGRAM, '.id');
        var CACHED_PROC = batch.def(batchCache, '[', PROG_ID, ']');
        batch(
          env.cond(CACHED_PROC)
            .then(CACHED_PROC, '.call(this,a0,a1);')
            .else(
              CACHED_PROC, '=', batchCache, '[', PROG_ID, ']=',
              env.link(function (program) {
                return createBody(emitBatchBody, env, args, program, 2)
              }), '(', PROGRAM, ');',
              CACHED_PROC, '.call(this,a0,a1);'));
      }
    }

    if (Object.keys(args.state).length > 0) {
      batch(env.shared.current, '.dirty=true;');
    }
  }

  // ===================================================
  // ===================================================
  // SCOPE COMMAND
  // ===================================================
  // ===================================================
  function emitScopeProc (env, args) {
    var scope = env.proc('scope', 3);
    env.batchId = 'a2';

    var shared = env.shared;
    var CURRENT_STATE = shared.current;

    emitContext(env, scope, args.context);

    if (args.framebuffer) {
      args.framebuffer.append(env, scope);
    }

    sortState(Object.keys(args.state)).forEach(function (name) {
      var defn = args.state[name];
      var value = defn.append(env, scope);
      if (isArrayLike(value)) {
        value.forEach(function (v, i) {
          scope.set(env.next[name], '[' + i + ']', v);
        });
      } else {
        scope.set(shared.next, '.' + name, value);
      }
    });

    emitProfile(env, scope, args, true, true)

    ;[S_ELEMENTS, S_OFFSET, S_COUNT, S_INSTANCES, S_PRIMITIVE].forEach(
      function (opt) {
        var variable = args.draw[opt];
        if (!variable) {
          return
        }
        scope.set(shared.draw, '.' + opt, '' + variable.append(env, scope));
      });

    Object.keys(args.uniforms).forEach(function (opt) {
      scope.set(
        shared.uniforms,
        '[' + stringStore.id(opt) + ']',
        args.uniforms[opt].append(env, scope));
    });

    Object.keys(args.attributes).forEach(function (name) {
      var record = args.attributes[name].append(env, scope);
      var scopeAttrib = env.scopeAttrib(name);
      Object.keys(new AttributeRecord()).forEach(function (prop) {
        scope.set(scopeAttrib, '.' + prop, record[prop]);
      });
    });

    function saveShader (name) {
      var shader = args.shader[name];
      if (shader) {
        scope.set(shared.shader, '.' + name, shader.append(env, scope));
      }
    }
    saveShader(S_VERT);
    saveShader(S_FRAG);

    if (Object.keys(args.state).length > 0) {
      scope(CURRENT_STATE, '.dirty=true;');
      scope.exit(CURRENT_STATE, '.dirty=true;');
    }

    scope('a1(', env.shared.context, ',a0,', env.batchId, ');');
  }

  function isDynamicObject (object) {
    if (typeof object !== 'object' || isArrayLike(object)) {
      return
    }
    var props = Object.keys(object);
    for (var i = 0; i < props.length; ++i) {
      if (dynamic.isDynamic(object[props[i]])) {
        return true
      }
    }
    return false
  }

  function splatObject (env, options, name) {
    var object = options.static[name];
    if (!object || !isDynamicObject(object)) {
      return
    }

    var globals = env.global;
    var keys = Object.keys(object);
    var thisDep = false;
    var contextDep = false;
    var propDep = false;
    var objectRef = env.global.def('{}');
    keys.forEach(function (key) {
      var value = object[key];
      if (dynamic.isDynamic(value)) {
        if (typeof value === 'function') {
          value = object[key] = dynamic.unbox(value);
        }
        var deps = createDynamicDecl(value, null);
        thisDep = thisDep || deps.thisDep;
        propDep = propDep || deps.propDep;
        contextDep = contextDep || deps.contextDep;
      } else {
        globals(objectRef, '.', key, '=');
        switch (typeof value) {
          case 'number':
            globals(value);
            break
          case 'string':
            globals('"', value, '"');
            break
          case 'object':
            if (Array.isArray(value)) {
              globals('[', value.join(), ']');
            }
            break
          default:
            globals(env.link(value));
            break
        }
        globals(';');
      }
    });

    function appendBlock (env, block) {
      keys.forEach(function (key) {
        var value = object[key];
        if (!dynamic.isDynamic(value)) {
          return
        }
        var ref = env.invoke(block, value);
        block(objectRef, '.', key, '=', ref, ';');
      });
    }

    options.dynamic[name] = new dynamic.DynamicVariable(DYN_THUNK, {
      thisDep: thisDep,
      contextDep: contextDep,
      propDep: propDep,
      ref: objectRef,
      append: appendBlock
    });
    delete options.static[name];
  }

  // ===========================================================================
  // ===========================================================================
  // MAIN DRAW COMMAND
  // ===========================================================================
  // ===========================================================================
  function compileCommand (options, attributes, uniforms, context, stats) {
    var env = createREGLEnvironment();

    // link stats, so that we can easily access it in the program.
    env.stats = env.link(stats);

    // splat options and attributes to allow for dynamic nested properties
    Object.keys(attributes.static).forEach(function (key) {
      splatObject(env, attributes, key);
    });
    NESTED_OPTIONS.forEach(function (name) {
      splatObject(env, options, name);
    });

    var args = parseArguments(options, attributes, uniforms, context, env);

    emitDrawProc(env, args);
    emitScopeProc(env, args);
    emitBatchProc(env, args);

    return env.compile()
  }

  // ===========================================================================
  // ===========================================================================
  // POLL / REFRESH
  // ===========================================================================
  // ===========================================================================
  return {
    next: nextState,
    current: currentState,
    procs: (function () {
      var env = createREGLEnvironment();
      var poll = env.proc('poll');
      var refresh = env.proc('refresh');
      var common = env.block();
      poll(common);
      refresh(common);

      var shared = env.shared;
      var GL = shared.gl;
      var NEXT_STATE = shared.next;
      var CURRENT_STATE = shared.current;

      common(CURRENT_STATE, '.dirty=false;');

      emitPollFramebuffer(env, poll);
      emitPollFramebuffer(env, refresh, null, true);

      // Refresh updates all attribute state changes
      var INSTANCING;
      if (extInstancing) {
        INSTANCING = env.link(extInstancing);
      }
      for (var i = 0; i < limits.maxAttributes; ++i) {
        var BINDING = refresh.def(shared.attributes, '[', i, ']');
        var ifte = env.cond(BINDING, '.buffer');
        ifte.then(
          GL, '.enableVertexAttribArray(', i, ');',
          GL, '.bindBuffer(',
            GL_ARRAY_BUFFER$1, ',',
            BINDING, '.buffer.buffer);',
          GL, '.vertexAttribPointer(',
            i, ',',
            BINDING, '.size,',
            BINDING, '.type,',
            BINDING, '.normalized,',
            BINDING, '.stride,',
            BINDING, '.offset);'
        ).else(
          GL, '.disableVertexAttribArray(', i, ');',
          GL, '.vertexAttrib4f(',
            i, ',',
            BINDING, '.x,',
            BINDING, '.y,',
            BINDING, '.z,',
            BINDING, '.w);',
          BINDING, '.buffer=null;');
        refresh(ifte);
        if (extInstancing) {
          refresh(
            INSTANCING, '.vertexAttribDivisorANGLE(',
            i, ',',
            BINDING, '.divisor);');
        }
      }

      Object.keys(GL_FLAGS).forEach(function (flag) {
        var cap = GL_FLAGS[flag];
        var NEXT = common.def(NEXT_STATE, '.', flag);
        var block = env.block();
        block('if(', NEXT, '){',
          GL, '.enable(', cap, ')}else{',
          GL, '.disable(', cap, ')}',
          CURRENT_STATE, '.', flag, '=', NEXT, ';');
        refresh(block);
        poll(
          'if(', NEXT, '!==', CURRENT_STATE, '.', flag, '){',
          block,
          '}');
      });

      Object.keys(GL_VARIABLES).forEach(function (name) {
        var func = GL_VARIABLES[name];
        var init = currentState[name];
        var NEXT, CURRENT;
        var block = env.block();
        block(GL, '.', func, '(');
        if (isArrayLike(init)) {
          var n = init.length;
          NEXT = env.global.def(NEXT_STATE, '.', name);
          CURRENT = env.global.def(CURRENT_STATE, '.', name);
          block(
            loop(n, function (i) {
              return NEXT + '[' + i + ']'
            }), ');',
            loop(n, function (i) {
              return CURRENT + '[' + i + ']=' + NEXT + '[' + i + '];'
            }).join(''));
          poll(
            'if(', loop(n, function (i) {
              return NEXT + '[' + i + ']!==' + CURRENT + '[' + i + ']'
            }).join('||'), '){',
            block,
            '}');
        } else {
          NEXT = common.def(NEXT_STATE, '.', name);
          CURRENT = common.def(CURRENT_STATE, '.', name);
          block(
            NEXT, ');',
            CURRENT_STATE, '.', name, '=', NEXT, ';');
          poll(
            'if(', NEXT, '!==', CURRENT, '){',
            block,
            '}');
        }
        refresh(block);
      });

      return env.compile()
    })(),
    compile: compileCommand
  }
}

function stats () {
  return {
    bufferCount: 0,
    elementsCount: 0,
    framebufferCount: 0,
    shaderCount: 0,
    textureCount: 0,
    cubeCount: 0,
    renderbufferCount: 0,
    maxTextureUnits: 0
  }
}

var GL_QUERY_RESULT_EXT = 0x8866;
var GL_QUERY_RESULT_AVAILABLE_EXT = 0x8867;
var GL_TIME_ELAPSED_EXT = 0x88BF;

var createTimer = function (gl, extensions) {
  if (!extensions.ext_disjoint_timer_query) {
    return null
  }

  // QUERY POOL BEGIN
  var queryPool = [];
  function allocQuery () {
    return queryPool.pop() || extensions.ext_disjoint_timer_query.createQueryEXT()
  }
  function freeQuery (query) {
    queryPool.push(query);
  }
  // QUERY POOL END

  var pendingQueries = [];
  function beginQuery (stats) {
    var query = allocQuery();
    extensions.ext_disjoint_timer_query.beginQueryEXT(GL_TIME_ELAPSED_EXT, query);
    pendingQueries.push(query);
    pushScopeStats(pendingQueries.length - 1, pendingQueries.length, stats);
  }

  function endQuery () {
    extensions.ext_disjoint_timer_query.endQueryEXT(GL_TIME_ELAPSED_EXT);
  }

  //
  // Pending stats pool.
  //
  function PendingStats () {
    this.startQueryIndex = -1;
    this.endQueryIndex = -1;
    this.sum = 0;
    this.stats = null;
  }
  var pendingStatsPool = [];
  function allocPendingStats () {
    return pendingStatsPool.pop() || new PendingStats()
  }
  function freePendingStats (pendingStats) {
    pendingStatsPool.push(pendingStats);
  }
  // Pending stats pool end

  var pendingStats = [];
  function pushScopeStats (start, end, stats) {
    var ps = allocPendingStats();
    ps.startQueryIndex = start;
    ps.endQueryIndex = end;
    ps.sum = 0;
    ps.stats = stats;
    pendingStats.push(ps);
  }

  // we should call this at the beginning of the frame,
  // in order to update gpuTime
  var timeSum = [];
  var queryPtr = [];
  function update () {
    var ptr, i;

    var n = pendingQueries.length;
    if (n === 0) {
      return
    }

    // Reserve space
    queryPtr.length = Math.max(queryPtr.length, n + 1);
    timeSum.length = Math.max(timeSum.length, n + 1);
    timeSum[0] = 0;
    queryPtr[0] = 0;

    // Update all pending timer queries
    var queryTime = 0;
    ptr = 0;
    for (i = 0; i < pendingQueries.length; ++i) {
      var query = pendingQueries[i];
      if (extensions.ext_disjoint_timer_query.getQueryObjectEXT(query, GL_QUERY_RESULT_AVAILABLE_EXT)) {
        queryTime += extensions.ext_disjoint_timer_query.getQueryObjectEXT(query, GL_QUERY_RESULT_EXT);
        freeQuery(query);
      } else {
        pendingQueries[ptr++] = query;
      }
      timeSum[i + 1] = queryTime;
      queryPtr[i + 1] = ptr;
    }
    pendingQueries.length = ptr;

    // Update all pending stat queries
    ptr = 0;
    for (i = 0; i < pendingStats.length; ++i) {
      var stats = pendingStats[i];
      var start = stats.startQueryIndex;
      var end = stats.endQueryIndex;
      stats.sum += timeSum[end] - timeSum[start];
      var startPtr = queryPtr[start];
      var endPtr = queryPtr[end];
      if (endPtr === startPtr) {
        stats.stats.gpuTime += stats.sum / 1e6;
        freePendingStats(stats);
      } else {
        stats.startQueryIndex = startPtr;
        stats.endQueryIndex = endPtr;
        pendingStats[ptr++] = stats;
      }
    }
    pendingStats.length = ptr;
  }

  return {
    beginQuery: beginQuery,
    endQuery: endQuery,
    pushScopeStats: pushScopeStats,
    update: update,
    getNumPendingQueries: function () {
      return pendingQueries.length
    },
    clear: function () {
      queryPool.push.apply(queryPool, pendingQueries);
      for (var i = 0; i < queryPool.length; i++) {
        extensions.ext_disjoint_timer_query.deleteQueryEXT(queryPool[i]);
      }
      pendingQueries.length = 0;
      queryPool.length = 0;
    },
    restore: function () {
      pendingQueries.length = 0;
      queryPool.length = 0;
    }
  }
};

var GL_COLOR_BUFFER_BIT = 16384;
var GL_DEPTH_BUFFER_BIT = 256;
var GL_STENCIL_BUFFER_BIT = 1024;

var GL_ARRAY_BUFFER = 34962;

var CONTEXT_LOST_EVENT = 'webglcontextlost';
var CONTEXT_RESTORED_EVENT = 'webglcontextrestored';

var DYN_PROP = 1;
var DYN_CONTEXT = 2;
var DYN_STATE = 3;

function find (haystack, needle) {
  for (var i = 0; i < haystack.length; ++i) {
    if (haystack[i] === needle) {
      return i
    }
  }
  return -1
}

function wrapREGL (args) {
  var config = parseArgs(args);
  if (!config) {
    return null
  }

  var gl = config.gl;
  var glAttributes = gl.getContextAttributes();
  var contextLost = gl.isContextLost();

  var extensionState = createExtensionCache(gl, config);
  if (!extensionState) {
    return null
  }

  var stringStore = createStringStore();
  var stats$$1 = stats();
  var extensions = extensionState.extensions;
  var timer = createTimer(gl, extensions);

  var START_TIME = clock();
  var WIDTH = gl.drawingBufferWidth;
  var HEIGHT = gl.drawingBufferHeight;

  var contextState = {
    tick: 0,
    time: 0,
    viewportWidth: WIDTH,
    viewportHeight: HEIGHT,
    framebufferWidth: WIDTH,
    framebufferHeight: HEIGHT,
    drawingBufferWidth: WIDTH,
    drawingBufferHeight: HEIGHT,
    pixelRatio: config.pixelRatio
  };
  var uniformState = {};
  var drawState = {
    elements: null,
    primitive: 4, // GL_TRIANGLES
    count: -1,
    offset: 0,
    instances: -1
  };

  var limits = wrapLimits(gl, extensions);
  var attributeState = wrapAttributeState(
    gl,
    extensions,
    limits,
    stringStore);
  var bufferState = wrapBufferState(
    gl,
    stats$$1,
    config,
    attributeState);
  var elementState = wrapElementsState(gl, extensions, bufferState, stats$$1);
  var shaderState = wrapShaderState(gl, stringStore, stats$$1, config);
  var textureState = createTextureSet(
    gl,
    extensions,
    limits,
    function () { core.procs.poll(); },
    contextState,
    stats$$1,
    config);
  var renderbufferState = wrapRenderbuffers(gl, extensions, limits, stats$$1, config);
  var framebufferState = wrapFBOState(
    gl,
    extensions,
    limits,
    textureState,
    renderbufferState,
    stats$$1);
  var core = reglCore(
    gl,
    stringStore,
    extensions,
    limits,
    bufferState,
    elementState,
    textureState,
    framebufferState,
    uniformState,
    attributeState,
    shaderState,
    drawState,
    contextState,
    timer,
    config);
  var readPixels = wrapReadPixels(
    gl,
    framebufferState,
    core.procs.poll,
    contextState,
    glAttributes, extensions, limits);

  var nextState = core.next;
  var canvas = gl.canvas;

  var rafCallbacks = [];
  var lossCallbacks = [];
  var restoreCallbacks = [];
  var destroyCallbacks = [config.onDestroy];

  var activeRAF = null;
  function handleRAF () {
    if (rafCallbacks.length === 0) {
      if (timer) {
        timer.update();
      }
      activeRAF = null;
      return
    }

    // schedule next animation frame
    activeRAF = raf.next(handleRAF);

    // poll for changes
    poll();

    // fire a callback for all pending rafs
    for (var i = rafCallbacks.length - 1; i >= 0; --i) {
      var cb = rafCallbacks[i];
      if (cb) {
        cb(contextState, null, 0);
      }
    }

    // flush all pending webgl calls
    gl.flush();

    // poll GPU timers *after* gl.flush so we don't delay command dispatch
    if (timer) {
      timer.update();
    }
  }

  function startRAF () {
    if (!activeRAF && rafCallbacks.length > 0) {
      activeRAF = raf.next(handleRAF);
    }
  }

  function stopRAF () {
    if (activeRAF) {
      raf.cancel(handleRAF);
      activeRAF = null;
    }
  }

  function handleContextLoss (event) {
    event.preventDefault();

    // set context lost flag
    contextLost = true;

    // pause request animation frame
    stopRAF();

    // lose context
    lossCallbacks.forEach(function (cb) {
      cb();
    });
  }

  function handleContextRestored (event) {
    // clear error code
    gl.getError();

    // clear context lost flag
    contextLost = false;

    // refresh state
    extensionState.restore();
    shaderState.restore();
    bufferState.restore();
    textureState.restore();
    renderbufferState.restore();
    framebufferState.restore();
    if (timer) {
      timer.restore();
    }

    // refresh state
    core.procs.refresh();

    // restart RAF
    startRAF();

    // restore context
    restoreCallbacks.forEach(function (cb) {
      cb();
    });
  }

  if (canvas) {
    canvas.addEventListener(CONTEXT_LOST_EVENT, handleContextLoss, false);
    canvas.addEventListener(CONTEXT_RESTORED_EVENT, handleContextRestored, false);
  }

  function destroy () {
    rafCallbacks.length = 0;
    stopRAF();

    if (canvas) {
      canvas.removeEventListener(CONTEXT_LOST_EVENT, handleContextLoss);
      canvas.removeEventListener(CONTEXT_RESTORED_EVENT, handleContextRestored);
    }

    shaderState.clear();
    framebufferState.clear();
    renderbufferState.clear();
    textureState.clear();
    elementState.clear();
    bufferState.clear();

    if (timer) {
      timer.clear();
    }

    destroyCallbacks.forEach(function (cb) {
      cb();
    });
  }

  function compileProcedure (options) {
    check$1(!!options, 'invalid args to regl({...})');
    check$1.type(options, 'object', 'invalid args to regl({...})');

    function flattenNestedOptions (options) {
      var result = extend({}, options);
      delete result.uniforms;
      delete result.attributes;
      delete result.context;

      if ('stencil' in result && result.stencil.op) {
        result.stencil.opBack = result.stencil.opFront = result.stencil.op;
        delete result.stencil.op;
      }

      function merge (name) {
        if (name in result) {
          var child = result[name];
          delete result[name];
          Object.keys(child).forEach(function (prop) {
            result[name + '.' + prop] = child[prop];
          });
        }
      }
      merge('blend');
      merge('depth');
      merge('cull');
      merge('stencil');
      merge('polygonOffset');
      merge('scissor');
      merge('sample');

      return result
    }

    function separateDynamic (object) {
      var staticItems = {};
      var dynamicItems = {};
      Object.keys(object).forEach(function (option) {
        var value = object[option];
        if (dynamic.isDynamic(value)) {
          dynamicItems[option] = dynamic.unbox(value, option);
        } else {
          staticItems[option] = value;
        }
      });
      return {
        dynamic: dynamicItems,
        static: staticItems
      }
    }

    // Treat context variables separate from other dynamic variables
    var context = separateDynamic(options.context || {});
    var uniforms = separateDynamic(options.uniforms || {});
    var attributes = separateDynamic(options.attributes || {});
    var opts = separateDynamic(flattenNestedOptions(options));

    var stats$$1 = {
      gpuTime: 0.0,
      cpuTime: 0.0,
      count: 0
    };

    var compiled = core.compile(opts, attributes, uniforms, context, stats$$1);

    var draw = compiled.draw;
    var batch = compiled.batch;
    var scope = compiled.scope;

    // FIXME: we should modify code generation for batch commands so this
    // isn't necessary
    var EMPTY_ARRAY = [];
    function reserve (count) {
      while (EMPTY_ARRAY.length < count) {
        EMPTY_ARRAY.push(null);
      }
      return EMPTY_ARRAY
    }

    function REGLCommand (args, body) {
      var i;
      if (contextLost) {
        check$1.raise('context lost');
      }
      if (typeof args === 'function') {
        return scope.call(this, null, args, 0)
      } else if (typeof body === 'function') {
        if (typeof args === 'number') {
          for (i = 0; i < args; ++i) {
            scope.call(this, null, body, i);
          }
          return
        } else if (Array.isArray(args)) {
          for (i = 0; i < args.length; ++i) {
            scope.call(this, args[i], body, i);
          }
          return
        } else {
          return scope.call(this, args, body, 0)
        }
      } else if (typeof args === 'number') {
        if (args > 0) {
          return batch.call(this, reserve(args | 0), args | 0)
        }
      } else if (Array.isArray(args)) {
        if (args.length) {
          return batch.call(this, args, args.length)
        }
      } else {
        return draw.call(this, args)
      }
    }

    return extend(REGLCommand, {
      stats: stats$$1
    })
  }

  var setFBO = framebufferState.setFBO = compileProcedure({
    framebuffer: dynamic.define.call(null, DYN_PROP, 'framebuffer')
  });

  function clearImpl (_, options) {
    var clearFlags = 0;
    core.procs.poll();

    var c = options.color;
    if (c) {
      gl.clearColor(+c[0] || 0, +c[1] || 0, +c[2] || 0, +c[3] || 0);
      clearFlags |= GL_COLOR_BUFFER_BIT;
    }
    if ('depth' in options) {
      gl.clearDepth(+options.depth);
      clearFlags |= GL_DEPTH_BUFFER_BIT;
    }
    if ('stencil' in options) {
      gl.clearStencil(options.stencil | 0);
      clearFlags |= GL_STENCIL_BUFFER_BIT;
    }

    check$1(!!clearFlags, 'called regl.clear with no buffer specified');
    gl.clear(clearFlags);
  }

  function clear (options) {
    check$1(
      typeof options === 'object' && options,
      'regl.clear() takes an object as input');
    if ('framebuffer' in options) {
      if (options.framebuffer &&
          options.framebuffer_reglType === 'framebufferCube') {
        for (var i = 0; i < 6; ++i) {
          setFBO(extend({
            framebuffer: options.framebuffer.faces[i]
          }, options), clearImpl);
        }
      } else {
        setFBO(options, clearImpl);
      }
    } else {
      clearImpl(null, options);
    }
  }

  function frame (cb) {
    check$1.type(cb, 'function', 'regl.frame() callback must be a function');
    rafCallbacks.push(cb);

    function cancel () {
      // FIXME:  should we check something other than equals cb here?
      // what if a user calls frame twice with the same callback...
      //
      var i = find(rafCallbacks, cb);
      check$1(i >= 0, 'cannot cancel a frame twice');
      function pendingCancel () {
        var index = find(rafCallbacks, pendingCancel);
        rafCallbacks[index] = rafCallbacks[rafCallbacks.length - 1];
        rafCallbacks.length -= 1;
        if (rafCallbacks.length <= 0) {
          stopRAF();
        }
      }
      rafCallbacks[i] = pendingCancel;
    }

    startRAF();

    return {
      cancel: cancel
    }
  }

  // poll viewport
  function pollViewport () {
    var viewport = nextState.viewport;
    var scissorBox = nextState.scissor_box;
    viewport[0] = viewport[1] = scissorBox[0] = scissorBox[1] = 0;
    contextState.viewportWidth =
      contextState.framebufferWidth =
      contextState.drawingBufferWidth =
      viewport[2] =
      scissorBox[2] = gl.drawingBufferWidth;
    contextState.viewportHeight =
      contextState.framebufferHeight =
      contextState.drawingBufferHeight =
      viewport[3] =
      scissorBox[3] = gl.drawingBufferHeight;
  }

  function poll () {
    contextState.tick += 1;
    contextState.time = now();
    pollViewport();
    core.procs.poll();
  }

  function refresh () {
    pollViewport();
    core.procs.refresh();
    if (timer) {
      timer.update();
    }
  }

  function now () {
    return (clock() - START_TIME) / 1000.0
  }

  refresh();

  function addListener (event, callback) {
    check$1.type(callback, 'function', 'listener callback must be a function');

    var callbacks;
    switch (event) {
      case 'frame':
        return frame(callback)
      case 'lost':
        callbacks = lossCallbacks;
        break
      case 'restore':
        callbacks = restoreCallbacks;
        break
      case 'destroy':
        callbacks = destroyCallbacks;
        break
      default:
        check$1.raise('invalid event, must be one of frame,lost,restore,destroy');
    }

    callbacks.push(callback);
    return {
      cancel: function () {
        for (var i = 0; i < callbacks.length; ++i) {
          if (callbacks[i] === callback) {
            callbacks[i] = callbacks[callbacks.length - 1];
            callbacks.pop();
            return
          }
        }
      }
    }
  }

  var regl = extend(compileProcedure, {
    // Clear current FBO
    clear: clear,

    // Short cuts for dynamic variables
    prop: dynamic.define.bind(null, DYN_PROP),
    context: dynamic.define.bind(null, DYN_CONTEXT),
    this: dynamic.define.bind(null, DYN_STATE),

    // executes an empty draw command
    draw: compileProcedure({}),

    // Resources
    buffer: function (options) {
      return bufferState.create(options, GL_ARRAY_BUFFER, false, false)
    },
    elements: function (options) {
      return elementState.create(options, false)
    },
    texture: textureState.create2D,
    cube: textureState.createCube,
    renderbuffer: renderbufferState.create,
    framebuffer: framebufferState.create,
    framebufferCube: framebufferState.createCube,

    // Expose context attributes
    attributes: glAttributes,

    // Frame rendering
    frame: frame,
    on: addListener,

    // System limits
    limits: limits,
    hasExtension: function (name) {
      return limits.extensions.indexOf(name.toLowerCase()) >= 0
    },

    // Read pixels
    read: readPixels,

    // Destroy regl and all associated resources
    destroy: destroy,

    // Direct GL state manipulation
    _gl: gl,
    _refresh: refresh,

    poll: function () {
      poll();
      if (timer) {
        timer.update();
      }
    },

    // Current time
    now: now,

    // regl Statistics Information
    stats: stats$$1
  });

  config.onDone(null, regl);

  return regl
}

return wrapREGL;

})));


},{}],7:[function(require,module,exports){
module.exports = (regl) => {
    return regl({
        vert: `
            precision mediump float;
            attribute vec2 xy;
            varying vec2 uv;
            void main () {
                uv = xy * 0.5 + 0.5;
                uv.y = 1.0-uv.y;
                gl_Position = vec4(xy, 0, 1);
            }
        `,
        frag: `
            precision mediump float;
            varying vec2 uv;
            uniform vec4 rect;

            void main () {
                if (uv.x < rect.x) discard;
                if (uv.x > rect.z) discard;
                if (uv.y > 1.0 - rect.y) discard;
                if (uv.y < 1.0 - rect.w) discard;
                gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
                // if (uv.y == 1.0 - rect.y) {
                //     // gl_FragColor = vec4(rand(uv, 1.0), rand(uv, 2.0)*0.25, rand(uv, 2.0), rand(uv, 3.0)*0.25);
                // } else {
                //     // gl_FragColor = vec4(rand(uv, 1.0), rand(uv, 2.0)*0.25, rand(uv, 2.0), rand(uv, 3.0)*0.25);
                //     // gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
                // }
            }
        `,
        attributes: {xy: [-4, -4, 0, 4, 4, -4]},
        uniforms: {
            rect: regl.prop('rect')
        },
        framebuffer: regl.prop('dst'),
        depth: { enable: false },
        count: 3,
    });
}
},{}],8:[function(require,module,exports){
const glsl = require('glslify')

module.exports = (regl) => {
    return regl({
        vert: `
            precision mediump float;
            attribute vec2 xy;
            varying vec2 uv;
            void main () {
                uv = xy * 0.5 + 0.5;
                gl_Position = vec4(xy, 0, 1);
            }
        `,
        frag: glsl`
            precision mediump float;
            uniform sampler2D u_src;
            uniform vec2 u_size;
            uniform float scale;
            varying vec2 uv;
            const float F = 0.037, K = 0.06;
            float D_a = 0.2*scale, D_b = 0.1*scale;

            void main() {
                vec4 n = texture2D(u_src, uv + vec2(0.0, 1.0)*u_size),
                     e = texture2D(u_src, uv + vec2(1.0, 0.0)*u_size),
                     s = texture2D(u_src, uv + vec2(0.0, -1.0)*u_size),
                     w = texture2D(u_src, uv + vec2(-1.0, 0.0)*u_size),

                     ne = texture2D(u_src, uv + vec2(1.0, 1.0)*u_size),
                     nw = texture2D(u_src, uv + vec2(-1.0, 1.0)*u_size),
                     se = texture2D(u_src, uv + vec2(1.0, -1.0)*u_size),
                     sw = texture2D(u_src, uv + vec2(-1.0, -1.0)*u_size);

                vec4 val = texture2D(u_src, uv);

                vec4 lap = (0.5 * (n + s + e + w) + 0.25 * (ne + nw + se + sw) - 3.0 * val);

                val += vec4(D_a * lap.x - val.x*val.y*val.y + F * (1.0-val.x),
                            D_b * lap.y + val.x*val.y*val.y - (K+F) * val.y,
                            1.5*D_a * lap.z - val.z*val.w*val.w + F * (1.0-val.z),
                            1.5*D_b * lap.w + val.z*val.w*val.w - (K+F) * val.w);

                /*  Make the two systems mutually exclusive by having the
                    dominant suppress the other. */
                if (val.y > val.w) {
                    gl_FragColor = vec4(val.x, val.y, val.z, val.w/2.0);
                } else {
                    gl_FragColor = vec4(val.x, val.y/2.0, val.z, val.w);
                }
            }
        `,
        attributes: {xy: [-4, -4, 0, 4, 4, -4]},
        uniforms: {
            scale: 0.3,
            u_src: regl.prop('src'),
            u_size: ctx => [1 / ctx.framebufferWidth, 1 / ctx.framebufferHeight],
        },
        framebuffer: regl.prop('dst'),
        depth: { enable: false },
        count: 3
    });
}
},{"glslify":3}],9:[function(require,module,exports){

function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) { return null }
    return  [
        parseInt(result[1], 16) / 255.0,
        parseInt(result[2], 16) / 255.0,
        parseInt(result[3], 16) / 255.0,
        1.0
    ]
}
module.exports = (regl) => {
    return regl({
        vert: `
            precision mediump float;
            attribute vec2 xy;
            varying vec2 uv;
            void main () {
                uv = xy * 0.5 + 0.5;
                uv.y = 1.0-uv.y;
                gl_Position = vec4(xy, 0, 1);
            }
        `,
        frag: `
            precision mediump float;
            varying vec2 uv;
            uniform sampler2D src;
            uniform int show;
            uniform vec4 colorA;
            uniform vec4 colorB;

            const float COLOR_MIN = 0.15, COLOR_MAX = 0.3;
            const vec4 WHITE = vec4( 1.0, 1.0, 1.0, 1.0 );

            float remap( float minval, float maxval, float curval ) {
                return ( curval - minval ) / ( maxval - minval );
            }

            void main() {
                vec4 pixel = texture2D(src, uv);
                float v1 = remap(COLOR_MIN, COLOR_MAX, pixel.y);
                float v2 = remap(COLOR_MIN, COLOR_MAX, pixel.w);

                if (show == 1) {
                    gl_FragColor = mix( WHITE, colorA, v1 );
                } else if (show == 2) {
                    gl_FragColor = mix( WHITE, colorB, v2 );
                } else if (show == 3) {
                    if (v2 < v1) {
                        gl_FragColor = mix( WHITE, colorA, v1 );
                    } else {
                        gl_FragColor = mix( WHITE, colorB, v2 );
                    }
                } else {
                    gl_FragColor = vec4(1, 1, 1, 1);
                }
            }
        `,
        uniforms: {
            colorA: regl.prop('colorA'),//hexToRgb("#0000e0"),
            colorB: regl.prop('colorB'),
            src: regl.prop('src'),
            show: 3,
        },
        attributes: {xy: [-4, -4, 0, 4, 4, -4]},
        depth: {enable: false},
        count: 3
    });
}
},{}],10:[function(require,module,exports){
module.exports = (regl) => {
    return regl({
        vert: `
            precision mediump float;
            attribute vec2 xy;
            varying vec2 uv;
            void main () {
                uv = xy * 0.5 + 0.5;
                // uv.y = 1.0-uv.y;
                gl_Position = vec4(xy, 0, 1);
            }
        `,
        frag: `
            precision mediump float;
            uniform sampler2D texture;
            uniform sampler2D random;
            varying vec2 uv;

            void main () {
                vec4 val = texture2D(texture, uv);
                vec4 rand = texture2D(random, uv);

                vec4 result = vec4(1.0, 0.0, 1.0, 0.0);

                if (val.g > 0.5 && rand.x > 0.5) {
                    result.x = 0.5;
                    result.y = 0.25;
                }
                if (val.r > 0.5 && rand.y > 0.7) {
                    result.z = 0.5;
                    result.w = 0.25;
                }
                gl_FragColor = result;
            }
        `,
        attributes: {xy: [-4, -4, 0, 4, 4, -4]},
        uniforms: {
            texture: regl.prop('texture'),
            random: regl.prop('random')
        },
        framebuffer: regl.prop('dst'),
        depth: { enable: false },
        count: 3,
    });
}
},{}],11:[function(require,module,exports){
module.exports = (regl) => {
    return regl({
        vert: `
            precision mediump float;
            attribute vec2 xy;
            varying vec2 uv;
            void main () {
                uv = xy * 0.5 + 0.5;
                // uv.y = 1.0 - uv.y;
                gl_Position = vec4(xy, 0, 1);
            }
        `,
        frag: `
            precision mediump float;
            uniform sampler2D u_src;
            uniform sampler2D old_texture;
            uniform sampler2D new_texture;
            uniform sampler2D random;
            varying vec2 uv;
            void main () {
                vec4 oldv = texture2D(u_src, uv);
                bool old_text = oldv.y > 0.2;
                bool new_seed = texture2D(new_texture, uv).g > 0.2;
                bool new_bound = texture2D(new_texture, uv).r > 0.2;
                bool old_seed = texture2D(old_texture, uv).g > 0.2;
                bool old_bound = texture2D(old_texture, uv).r > 0.2;
                vec4 result = oldv;
                vec4 rand = texture2D(random, uv);

                /* Clear morph2 to allow morph1 to grow.
                */

                if (old_bound && new_bound) {

                }

                if (!new_bound) {
                    result.zw = vec2(1.0, 0.0);
                }

                if (new_seed) {
                    if (rand.x > 0.8) {
                        result.xy = vec2(0.5, 0.25);
                    } else {
                        result.xy = vec2(1.0, 0.0);
                    }
                }

                if (old_text) {
                    result.xy = vec2(1.0, 0.0);
                }

                if (new_bound) {
                    if (old_bound) {
                        result.zw = oldv.zw;
                    }
                    else if (rand.y > 0.9) {
                        result.zw = vec2(0.5, 0.25);
                    } else {
                        result.zw = vec2(1.0, 0.0);
                    }
                }
                gl_FragColor = result;
            }
        `,
        attributes: {xy: [-4, -4, 0, 4, 4, -4]},
        uniforms: {
            u_src: regl.prop('src'),
            old_texture: regl.prop('old_texture'),
            new_texture: regl.prop('new_texture'),
            random: regl.prop('random')
            // regl.texture({
            //     width: 512, height: 256, data: random_list(512*256*4)
            // })
        },
        framebuffer: regl.prop('dst'),
        depth: {enable: false},
        count: 3,
    });
}
},{}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJpbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9mYWlsLW5pY2VseS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9nbHNsaWZ5L2Jyb3dzZXIuanMiLCJub2RlX21vZHVsZXMvaC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9pbWFnZS1wcm9taXNlL2Rpc3QvaW1hZ2UtcHJvbWlzZS5jb21tb24tanMuanMiLCJub2RlX21vZHVsZXMvcmVnbC9kaXN0L3JlZ2wuanMiLCJzaGFkZXJzL2NsZWFyX3JlY3QuanMiLCJzaGFkZXJzL2NvbXB1dGUuanMiLCJzaGFkZXJzL2RyYXcuanMiLCJzaGFkZXJzL2luaXRpYWxpemUuanMiLCJzaGFkZXJzL3RyYW5zaXRpb24uanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1N1NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uKCl7ZnVuY3Rpb24gcihlLG4sdCl7ZnVuY3Rpb24gbyhpLGYpe2lmKCFuW2ldKXtpZighZVtpXSl7dmFyIGM9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZTtpZighZiYmYylyZXR1cm4gYyhpLCEwKTtpZih1KXJldHVybiB1KGksITApO3ZhciBhPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIraStcIidcIik7dGhyb3cgYS5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGF9dmFyIHA9bltpXT17ZXhwb3J0czp7fX07ZVtpXVswXS5jYWxsKHAuZXhwb3J0cyxmdW5jdGlvbihyKXt2YXIgbj1lW2ldWzFdW3JdO3JldHVybiBvKG58fHIpfSxwLHAuZXhwb3J0cyxyLGUsbix0KX1yZXR1cm4gbltpXS5leHBvcnRzfWZvcih2YXIgdT1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlLGk9MDtpPHQubGVuZ3RoO2krKylvKHRbaV0pO3JldHVybiBvfXJldHVybiByfSkoKSIsIi8vIHZhciBjcmVhdGVDb250cm9scyA9IHJlcXVpcmUoJy4vY29udHJvbHMnKTtcbi8vIGNvbnN0IG5vcm1hbGl6ZSA9IHJlcXVpcmUoJ2dsLXZlYzMvbm9ybWFsaXplJylcbmNvbnN0IGdsc2wgPSByZXF1aXJlKCdnbHNsaWZ5JylcbmNvbnN0IGxvYWRJbWFnZSA9IHJlcXVpcmUoJ2ltYWdlLXByb21pc2UnKVxuXG5cbmZ1bmN0aW9uIHJhbmRvbV9saXN0KHNpemUpIHtcbiAgICBjb25zdCByZXN1bHQgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNpemU7IGkrKykge1xuICAgICAgICByZXN1bHQucHVzaChNYXRoLmZsb29yKDI1NSpNYXRoLnJhbmRvbSgpKSlcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdFxufVxuZnVuY3Rpb24gaW50ZXJwb2xhdGUoYSwgYiwgdikge1xuICAgIHJldHVybiBbXG4gICAgICAgICgxLXYpKmFbMF0rIHYqYlswXSxcbiAgICAgICAgKDEtdikqYVsxXSsgdipiWzFdLFxuICAgICAgICAoMS12KSphWzJdKyB2KmJbMl0sXG4gICAgICAgICgxLXYpKmFbM10rIHYqYlszXVxuICAgIF1cbn1cblxucmVxdWlyZSgncmVnbCcpKHtcbiAgICBwaXhlbFJhdGlvOiAxLjAsXG4gICAgZXh0ZW5zaW9uczogW1xuICAgICAgICAnb2VzX3RleHR1cmVfZmxvYXQnLFxuICAgIF0sXG4gICAgb3B0aW9uYWxFeHRlbnNpb25zOiBbXG4gICAgICAgICdvZXNfdGV4dHVyZV9oYWxmX2Zsb2F0J1xuICAgIF0sXG4gICAgYXR0cmlidXRlczoge1xuICAgICAgICBhbnRpYWxpYXM6IGZhbHNlXG4gICAgfSxcbiAgICBvbkRvbmU6IHJlcXVpcmUoJ2ZhaWwtbmljZWx5JykobWFpbilcbn0pO1xuXG5mdW5jdGlvbiBtYWluKHJlZ2wpIHtcbiAgICBsZXQgdztcbiAgICBsZXQgaDtcbiAgICBsZXQgc2NhbGUgPSAxLjA7XG5cbiAgICBsZXQgc3RhdGVzID0gW11cblxuICAgIGxldCBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY29udGFpbmVyJylcbiAgICBsZXQgdGVzdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd0ZXN0JylcbiAgICBsZXQgY29udHJvbFJvb3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblxuICAgIGNvbnN0IGNsZWFyX3JlY3QgPSByZXF1aXJlKCcuL3NoYWRlcnMvY2xlYXJfcmVjdC5qcycpKHJlZ2wpXG4gICAgY29uc3QgaW5pdGlhbGl6ZSA9IHJlcXVpcmUoJy4vc2hhZGVycy9pbml0aWFsaXplLmpzJykocmVnbClcbiAgICBjb25zdCB0cmFuc2l0aW9uID0gcmVxdWlyZSgnLi9zaGFkZXJzL3RyYW5zaXRpb24uanMnKShyZWdsKVxuICAgIGNvbnN0IGNvbXB1dGUgPSByZXF1aXJlKCcuL3NoYWRlcnMvY29tcHV0ZS5qcycpKHJlZ2wpXG4gICAgY29uc3QgZHJhdyA9IHJlcXVpcmUoJy4vc2hhZGVycy9kcmF3LmpzJykocmVnbClcblxuICAgIGNvbnNvbGUudGltZSgnbG9hZF9pbWFnZXMnKVxuICAgIFByb21pc2UuYWxsKFtcbiAgICAgICAgUHJvbWlzZS5hbGwoW1xuICAgICAgICAgICAgbG9hZEltYWdlKCdpbWdzL3RpdGxlLnBuZycpLFxuICAgICAgICAgICAgbG9hZEltYWdlKCdpbWdzL2dlbl9kZXNpZ24ucG5nJylcbiAgICAgICAgXSksXG4gICAgICAgIFByb21pc2UuYWxsKFtcbiAgICAgICAgICAgIGxvYWRJbWFnZSgnaW1ncy90aXRsZV9tb2JpbGUucG5nJyksXG4gICAgICAgICAgICBsb2FkSW1hZ2UoJ2ltZ3MvZ2VuX2Rlc2lnbl9tb2JpbGUucG5nJylcbiAgICAgICAgXSksXG5cbiAgICBdKS50aGVuKChbIGltYWdlcywgbW9iaWxlX2ltYWdlcyBdKSA9PiB7XG4gICAgICAgIGNvbnNvbGUudGltZUVuZCgnbG9hZF9pbWFnZXMnKVxuXG4gICAgICAgIGNvbnN0IHBvcnRyYWl0X3RleHR1cmVzID0gbW9iaWxlX2ltYWdlcy5tYXAocmVnbC50ZXh0dXJlKVxuICAgICAgICBjb25zdCBsYW5kc2NhcGVfdGV4dHVyZXMgPSBpbWFnZXMubWFwKHJlZ2wudGV4dHVyZSlcbiAgICAgICAgbGV0IHRleHR1cmVzID0gbGFuZHNjYXBlX3RleHR1cmVzXG5cbiAgICAgICAgY29uc3QgcHVycGxlID0gWzEyOC8yNTUsIDY2LzI1NSwgMjQ0LzI1NSwgMS4wXVxuICAgICAgICBjb25zdCByZWQgPSBbMjE0LzI1NSwgNDQvMjU1LCA5OC8yNTUsIDEuMF1cblxuICAgICAgICBjb25zdCBzdGF0ZV9jb2xvcnMgPSBbXG4gICAgICAgICAgICBbWy45OCwgLjk4LCAuOTgsIDEuMF0sIHB1cnBsZV0sXG4gICAgICAgICAgICBbWzAsIDAuMCwgLjksIDEuMF0sIFsuOTIsIC45MiwgLjkyLCAxLjBdXSxcbiAgICAgICAgICAgIC8vIFtwdXJwbGUsIHB1cnBsZV0sXG4gICAgICAgICAgICBbcmVkLCByZWRdXG4gICAgICAgIF1cblxuXG4gICAgICAgIC8vIGNvbnNvbGUubG9nKCdvbmxvYWQnKVxuXG4gICAgICAgIGxldCBjb2xvckEgPSBzdGF0ZV9jb2xvcnNbMF1bMF1cbiAgICAgICAgbGV0IGNvbG9yQiA9IHN0YXRlX2NvbG9yc1swXVsxXVxuXG4gICAgICAgIGxldCByZWN0ID0gbmV3IEZsb2F0MzJBcnJheSg0KTtcbiAgICAgICAgbGV0IHJlY3RCdWYgPSByZWdsLmJ1ZmZlcihyZWN0KTtcblxuICAgICAgICBmdW5jdGlvbiBzY3JvbGxfaW5kZXgoKSB7XG4gICAgICAgICAgICBjb25zdCBzdGVwID0gY29udGFpbmVyLnNjcm9sbEhlaWdodCAvIGltYWdlcy5sZW5ndGhcbiAgICAgICAgICAgIGNvbnN0IHkgPSBjb250YWluZXIuc2Nyb2xsVG9wXG4gICAgICAgICAgICBjb25zdCBpZHggPSBNYXRoLm1pbihNYXRoLmZsb29yKHkgLyBzdGVwKSwgaW1hZ2VzLmxlbmd0aCAtMSlcbiAgICAgICAgICAgIGNvbnN0IHBlcmNlbnQgPSAoeSAtIGlkeCpzdGVwKSAvIHN0ZXBcbiAgICAgICAgICAgIHJldHVybiBbIGlkeCwgcGVyY2VudCBdXG4gICAgICAgIH1cblxuICAgICAgICBsZXQgWyBzY3JvbGxfaWR4LCBzY3JvbGxfcGVyY2VudCBdID0gc2Nyb2xsX2luZGV4KClcbiAgICAgICAgbGV0IGxhc3Rfc2Nyb2xsX2lkeCA9IHNjcm9sbF9pZHhcblxuXG4gICAgICAgIGZ1bmN0aW9uIHJlc3RhcnQoKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygncmVzdGFydCcpXG4gICAgICAgICAgICB3ID0gTWF0aC5mbG9vcihyZWdsLl9nbC5jYW52YXMud2lkdGggKiBzY2FsZSk7XG4gICAgICAgICAgICBoID0gTWF0aC5mbG9vcihyZWdsLl9nbC5jYW52YXMuaGVpZ2h0ICogc2NhbGUpO1xuICAgICAgICAgICAgY29uc29sZS5sb2codywgaClcbiAgICAgICAgICAgIHRleHR1cmVzID0gdyA+IDEyMDAgPyBsYW5kc2NhcGVfdGV4dHVyZXMgOiBwb3J0cmFpdF90ZXh0dXJlc1xuXG4gICAgICAgICAgICBzdGF0ZXMgPSBbMCwgMV0ubWFwKGkgPT4gKHN0YXRlc1tpXSB8fCByZWdsLmZyYW1lYnVmZmVyKSh7XG4gICAgICAgICAgICAgICAgY29sb3JUeXBlOiByZWdsLmhhc0V4dGVuc2lvbignb2VzX3RleHR1cmVfaGFsZl9mbG9hdCcpID8gJ2hhbGYgZmxvYXQnIDogJ2Zsb2F0JyxcbiAgICAgICAgICAgICAgICB3aWR0aDogdyxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGgsXG4gICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICBjb25zdCByYW5kb20gPSByZWdsLnRleHR1cmUoe1xuICAgICAgICAgICAgICB3aWR0aDogNTEyLFxuICAgICAgICAgICAgICBoZWlnaHQ6IDI1NixcbiAgICAgICAgICAgICAgZGF0YTogcmFuZG9tX2xpc3QoNTEyKjI1Nio0KVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIGluaXRpYWxpemUoeyBkc3Q6IHN0YXRlc1swXSwgdGV4dHVyZTogdGV4dHVyZXNbMF0sIHJhbmRvbX0pO1xuICAgICAgICAgICAgdXBkYXRlX3Njcm9sbCgpXG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiB1cGRhdGVfc2Nyb2xsKCkge1xuICAgICAgICAgICAgW3Njcm9sbF9pZHgsIHNjcm9sbF9wZXJjZW50XSA9IHNjcm9sbF9pbmRleCgpXG4gICAgICAgICAgICBpZiAoc2Nyb2xsX2lkeCAhPSBsYXN0X3Njcm9sbF9pZHgpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygndHJhbnNpdGlvbicsIGxhc3Rfc2Nyb2xsX2lkeCwgc2Nyb2xsX2lkeClcbiAgICAgICAgICAgICAgICB0cmFuc2l0aW9uKHtcbiAgICAgICAgICAgICAgICAgICAgc3JjOiBzdGF0ZXNbMV0sXG4gICAgICAgICAgICAgICAgICAgIGRzdDogc3RhdGVzWzBdLFxuICAgICAgICAgICAgICAgICAgICBvbGRfdGV4dHVyZTogdGV4dHVyZXNbbGFzdF9zY3JvbGxfaWR4XSxcbiAgICAgICAgICAgICAgICAgICAgbmV3X3RleHR1cmU6IHRleHR1cmVzW3Njcm9sbF9pZHhdLFxuICAgICAgICAgICAgICAgICAgICByYW5kb206IHJlZ2wudGV4dHVyZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICB3aWR0aDogNTEyLCBoZWlnaHQ6IDI1NiwgZGF0YTogcmFuZG9tX2xpc3QoNTEyKjI1Nio0KVxuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgbGFzdF9zY3JvbGxfaWR4ID0gc2Nyb2xsX2lkeFxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBsZXQgcCA9IChzY3JvbGxfcGVyY2VudClcbiAgICAgICAgICAgIGxldCBmb29cbiAgICAgICAgICAgIGlmIChzY3JvbGxfaWR4ID09IDApIHtcbiAgICAgICAgICAgICAgICBmb28gPSBwXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocCA8IDAuMjUpIHtcbiAgICAgICAgICAgICAgICBmb28gPSAwXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHAgPiAwLjc1KSB7XG4gICAgICAgICAgICAgICAgZm9vID0gMS4wXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGZvbyA9IChwLTAuMjUpICogMi4wXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb2xvckEgPSBpbnRlcnBvbGF0ZShzdGF0ZV9jb2xvcnNbc2Nyb2xsX2lkeF1bMF0sIHN0YXRlX2NvbG9yc1tzY3JvbGxfaWR4KzFdWzBdLCBmb28pXG4gICAgICAgICAgICBjb2xvckIgPSBpbnRlcnBvbGF0ZShzdGF0ZV9jb2xvcnNbc2Nyb2xsX2lkeF1bMV0sIHN0YXRlX2NvbG9yc1tzY3JvbGxfaWR4KzFdWzFdLCBmb28pXG4gICAgICAgICAgICAvLyBjb25zb2xlLmxvZyhzY3JvbGxfcGVyY2VudCwgY29sb3JBKVxuICAgICAgICB9XG5cbiAgICAgICAgY29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoJ3Njcm9sbCcsIChldmVudCkgPT4ge1xuICAgICAgICAgICAgdXBkYXRlX3Njcm9sbCgpXG4gICAgICAgIH0pXG5cbiAgICAgICAgcmVzdGFydCgpXG5cbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHJlc3RhcnQpXG4gICAgICAgIGxldCBpdGVyc1BlckZyYW1lID0gMlxuICAgICAgICBsZXQgcHJldlRpbWUgPSBudWxsXG4gICAgICAgIGxldCBzbG93Q291bnQgPSAwXG4gICAgICAgIHJlZ2wuZnJhbWUoKHt0aWNrLCB0aW1lfSkgPT4ge1xuICAgICAgICAgICAgaWYgKHByZXZUaW1lKSB7XG4gICAgICAgICAgICAgICAgdmFyIGR0ID0gdGltZSAtIHByZXZUaW1lO1xuICAgICAgICAgICAgICAgIGlmIChkdCA+IDEuNCAvIDYwKSB7XG4gICAgICAgICAgICAgICAgICAgIHNsb3dDb3VudCsrO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoZHQgPCAxLjEgLyA2MCkge1xuICAgICAgICAgICAgICAgICAgICBzbG93Q291bnQtLTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHNsb3dDb3VudCA+IDEwKSB7XG4gICAgICAgICAgICAgICAgICAgIHNsb3dDb3VudCA9IDA7XG4gICAgICAgICAgICAgICAgICAgIGl0ZXJzUGVyRnJhbWUgPSBNYXRoLm1heCgxLCBpdGVyc1BlckZyYW1lIC0gMSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChzbG93Q291bnQgPCAtMTApIHtcbiAgICAgICAgICAgICAgICAgICAgc2xvd0NvdW50ID0gMDtcbiAgICAgICAgICAgICAgICAgICAgaXRlcnNQZXJGcmFtZSA9IE1hdGgubWluKDEwLCBpdGVyc1BlckZyYW1lICsgMSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcHJldlRpbWUgPSB0aW1lO1xuXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGl0ZXJzUGVyRnJhbWU7IGkrKykge1xuICAgICAgICAgICAgICAgIGNvbXB1dGUoe3NyYzogc3RhdGVzWzBdLCBkc3Q6IHN0YXRlc1sxXX0pO1xuICAgICAgICAgICAgICAgIGNvbXB1dGUoe3NyYzogc3RhdGVzWzFdLCBkc3Q6IHN0YXRlc1swXX0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYm91bmRzID0gdGVzdC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKVxuICAgICAgICAgICAgY2xlYXJfcmVjdCh7XG4gICAgICAgICAgICAgICAgZHN0OiBzdGF0ZXNbMF0sXG4gICAgICAgICAgICAgICAgcmVjdDogW1xuICAgICAgICAgICAgICAgICAgICBib3VuZHMubGVmdCAvIHdpbmRvdy5pbm5lcldpZHRoLFxuICAgICAgICAgICAgICAgICAgICBib3VuZHMudG9wIC8gd2luZG93LmlubmVySGVpZ2h0LFxuICAgICAgICAgICAgICAgICAgICBib3VuZHMucmlnaHQgLyB3aW5kb3cuaW5uZXJXaWR0aCxcbiAgICAgICAgICAgICAgICAgICAgYm91bmRzLmJvdHRvbSAvIHdpbmRvdy5pbm5lckhlaWdodFxuICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgZHJhdyh7IGNvbG9yQSwgY29sb3JCLCBzcmM6IHN0YXRlc1swXSB9KTtcbiAgICAgICAgfSlcbiAgICB9KVxufSIsIid1c2Ugc3RyaWN0J1xuXG52YXIgaCA9IHJlcXVpcmUoJ2gnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZhaWxOaWNlbHlcblxuZnVuY3Rpb24gZmFpbE5pY2VseSAoY2FsbGJhY2ssIG9wdGlvbnMpIHtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge31cblxuICByZXR1cm4gZnVuY3Rpb24gKGVyciwgZGF0YSkge1xuICAgIGlmICghZXJyKSB7XG4gICAgICByZXR1cm4gY2FsbGJhY2sgJiYgY2FsbGJhY2soZGF0YSlcbiAgICB9XG5cbiAgICBpZiAoZXJyIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICAgIGVyciA9IGVyci5uYW1lICsgJzogJyArIGVyci5tZXNzYWdlXG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZXJyICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdmYWlsLW5pY2VseTogT29wcyEgdGhlIG1lc3NhZ2UgbXVzdCBiZSBhIFN0cmluZyBvciBhbiBFcnJvci4gSG93IGlyb25pYy4nKVxuICAgIH1cblxuICAgIHZhciB6SW5kZXggPSBvcHRpb25zLnpJbmRleCA9PT0gdW5kZWZpbmVkID8gOTk5OSA6IHBhcnNlSW50KG9wdGlvbnMuekluZGV4KVxuICAgIHZhciBiZyA9IG9wdGlvbnMuYmcgPT09IHVuZGVmaW5lZCA/ICcjMzMzJyA6IG9wdGlvbnMuYmdcbiAgICB2YXIgZmcgPSBvcHRpb25zLmZnID09PSB1bmRlZmluZWQgPyAnI2ZmZicgOiBvcHRpb25zLmZnXG4gICAgdmFyIHRpdGxlID0gb3B0aW9ucy50aXRsZSA9PT0gdW5kZWZpbmVkID8gJ1NvcnJ5IScgOiBvcHRpb25zLnRpdGxlXG4gICAgdmFyIGZvbnRGYW1pbHkgPSBvcHRpb25zLmZvbnRGYW1pbHkgPT09IHVuZGVmaW5lZCA/ICdIZWx2ZXRpY2EsIEFyaWFsLCBzYW5zLXNlcmlmJyA6IG9wdGlvbnMuZm9udEZhbWlseVxuICAgIHZhciBwb3NpdGlvbiA9IG9wdGlvbnMucG9zaXRpb24gPT09IHVuZGVmaW5lZCA/ICdmaXhlZCcgOiBvcHRpb25zLnBvc2l0aW9uXG4gICAgdmFyIGludmVydCA9IG9wdGlvbnMuaW52ZXJ0ID09PSB1bmRlZmluZWQgPyBmYWxzZSA6ICEhb3B0aW9ucy5pbnZlcnRcblxuICAgIGlmIChpbnZlcnQpIHtcbiAgICAgIHZhciB0bXAgPSBmZ1xuICAgICAgZmcgPSBiZ1xuICAgICAgYmcgPSB0bXBcbiAgICB9XG5cbiAgICB2YXIgb3ZlcmxheVN0eWxlcyA9IHtcbiAgICAgIHBvc2l0aW9uOiBwb3NpdGlvbixcbiAgICAgIHRvcDogMCxcbiAgICAgIHJpZ2h0OiAwLFxuICAgICAgYm90dG9tOiAwLFxuICAgICAgbGVmdDogMCxcbiAgICAgICdiYWNrZ3JvdW5kLWNvbG9yJzogYmcsXG4gICAgICBjb2xvcjogZmcsXG4gICAgICAndGV4dC1hbGlnbic6ICdjZW50ZXInLFxuICAgICAgJ3otaW5kZXgnOiB6SW5kZXhcbiAgICB9XG5cbiAgICB2YXIgaGVhZGluZ1N0eWxlcyA9IHtcbiAgICAgICdmb250LWZhbWlseSc6IGZvbnRGYW1pbHlcbiAgICB9XG5cbiAgICB2YXIgZXhwbGFuYXRpb25TdHlsZXMgPSB7XG4gICAgICAnZm9udC1mYW1pbHknOiBmb250RmFtaWx5LFxuICAgICAgJ21heC13aWR0aCc6ICc2NDBweCcsXG4gICAgICAnbWFyZ2luLWxlZnQnOiAnYXV0bycsXG4gICAgICAnbWFyZ2luLXJpZ2h0JzogJ2F1dG8nLFxuICAgICAgJ2xpbmUtaGVpZ2h0JzogJzEuNCcsXG4gICAgICAncGFkZGluZyc6ICcwIDE1cHgnXG4gICAgfVxuXG4gICAgdmFyIGNvbnRhaW5lclN0eWxlcyA9IHtcbiAgICAgICd0cmFuc2Zvcm0nOiAndHJhbnNsYXRlKDAsIC01MCUpJyxcbiAgICAgICdtYXJnaW4tdG9wJzogJzUwdmgnXG4gICAgfVxuXG4gICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChoKCdkaXYnLCB7c3R5bGU6IG92ZXJsYXlTdHlsZXN9LCBbXG4gICAgICBoKCdkaXYnLCB7c3R5bGU6IGNvbnRhaW5lclN0eWxlc30sIFtcbiAgICAgICAgaCgnaDEnLCB0aXRsZSwge3N0eWxlOiBoZWFkaW5nU3R5bGVzfSksXG4gICAgICAgIGgoJ3AnLCBlcnIsIHtzdHlsZTogZXhwbGFuYXRpb25TdHlsZXN9KVxuICAgICAgXSlcbiAgICBdKSlcbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihzdHJpbmdzKSB7XHJcbiAgaWYgKHR5cGVvZiBzdHJpbmdzID09PSAnc3RyaW5nJykgc3RyaW5ncyA9IFtzdHJpbmdzXVxyXG4gIHZhciBleHBycyA9IFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzLDEpXHJcbiAgdmFyIHBhcnRzID0gW11cclxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0cmluZ3MubGVuZ3RoLTE7IGkrKykge1xyXG4gICAgcGFydHMucHVzaChzdHJpbmdzW2ldLCBleHByc1tpXSB8fCAnJylcclxuICB9XHJcbiAgcGFydHMucHVzaChzdHJpbmdzW2ldKVxyXG4gIHJldHVybiBwYXJ0cy5qb2luKCcnKVxyXG59XHJcbiIsIjsoZnVuY3Rpb24gKCkge1xuXG5mdW5jdGlvbiBoKCkge1xuICB2YXIgYXJncyA9IFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzKSwgZSA9IG51bGxcbiAgZnVuY3Rpb24gaXRlbSAobCkge1xuICAgIFxuICAgIGZ1bmN0aW9uIHBhcnNlQ2xhc3MgKHN0cmluZykge1xuICAgICAgdmFyIG0gPSBzdHJpbmcuc3BsaXQoLyhbXFwuI10/W2EtekEtWjAtOV8tXSspLylcbiAgICAgIG0uZm9yRWFjaChmdW5jdGlvbiAodikge1xuICAgICAgICB2YXIgcyA9IHYuc3Vic3RyaW5nKDEsdi5sZW5ndGgpXG4gICAgICAgIGlmKCF2KSByZXR1cm4gXG4gICAgICAgIGlmKCFlKVxuICAgICAgICAgIGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KHYpXG4gICAgICAgIGVsc2UgaWYgKHZbMF0gPT09ICcuJylcbiAgICAgICAgICBlLmNsYXNzTGlzdC5hZGQocylcbiAgICAgICAgZWxzZSBpZiAodlswXSA9PT0gJyMnKVxuICAgICAgICAgIGUuc2V0QXR0cmlidXRlKCdpZCcsIHMpXG4gICAgICAgIFxuICAgICAgfSlcbiAgICB9XG5cbiAgICBpZihsID09IG51bGwpXG4gICAgICA7XG4gICAgZWxzZSBpZignc3RyaW5nJyA9PT0gdHlwZW9mIGwpIHtcbiAgICAgIGlmKCFlKVxuICAgICAgICBwYXJzZUNsYXNzKGwpXG4gICAgICBlbHNlXG4gICAgICAgIGUuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUobCkpXG4gICAgfVxuICAgIGVsc2UgaWYoJ251bWJlcicgPT09IHR5cGVvZiBsIFxuICAgICAgfHwgJ2Jvb2xlYW4nID09PSB0eXBlb2YgbFxuICAgICAgfHwgbCBpbnN0YW5jZW9mIERhdGUgXG4gICAgICB8fCBsIGluc3RhbmNlb2YgUmVnRXhwICkge1xuICAgICAgICBlLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKGwudG9TdHJpbmcoKSkpXG4gICAgfVxuICAgIGVsc2UgaWYgKEFycmF5LmlzQXJyYXkobCkpXG4gICAgICBsLmZvckVhY2goaXRlbSlcbiAgICBlbHNlIGlmKGwgaW5zdGFuY2VvZiBIVE1MRWxlbWVudClcbiAgICAgIGUuYXBwZW5kQ2hpbGQobClcbiAgICBlbHNlIGlmICgnb2JqZWN0JyA9PT0gdHlwZW9mIGwpIHtcbiAgICAgIGZvciAodmFyIGsgaW4gbCkge1xuICAgICAgICBpZignZnVuY3Rpb24nID09PSB0eXBlb2YgbFtrXSlcbiAgICAgICAgICBlLmFkZEV2ZW50TGlzdGVuZXIoaywgbFtrXSlcbiAgICAgICAgZWxzZSBpZihrID09PSAnc3R5bGUnKSB7XG4gICAgICAgICAgZm9yICh2YXIgcyBpbiBsW2tdKVxuICAgICAgICAgICAgZS5zdHlsZS5zZXRQcm9wZXJ0eShzLCBsW2tdW3NdKVxuICAgICAgICB9XG4gICAgICAgIGVsc2VcbiAgICAgICAgICBlLnNldEF0dHJpYnV0ZShrLCBsW2tdKVxuICAgICAgfVxuICAgIH1cbiAgfVxuICB3aGlsZShhcmdzLmxlbmd0aCkge1xuICAgIGl0ZW0oYXJncy5zaGlmdCgpKVxuICB9XG4gIHJldHVybiBlXG59XG5cbmlmKHR5cGVvZiBtb2R1bGUgPT09ICdvYmplY3QnKVxuICBtb2R1bGUuZXhwb3J0cyA9IGhcbmVsc2VcbiAgdGhpcy5oID0gaFxufSkoKVxuIiwiLyohIG5wbS5pbS9pbWFnZS1wcm9taXNlIDYuMC4wICovXG4ndXNlIHN0cmljdCc7XG5cbmZ1bmN0aW9uIGxvYWQoaW1hZ2UsIGF0dHJpYnV0ZXMpIHtcblx0aWYgKCFpbWFnZSkge1xuXHRcdHJldHVybiBQcm9taXNlLnJlamVjdCgpO1xuXHR9IGVsc2UgaWYgKHR5cGVvZiBpbWFnZSA9PT0gJ3N0cmluZycpIHtcblx0XHQvKiBDcmVhdGUgYSA8aW1nPiBmcm9tIGEgc3RyaW5nICovXG5cdFx0dmFyIHNyYyA9IGltYWdlO1xuXHRcdGltYWdlID0gbmV3IEltYWdlKCk7XG5cdFx0T2JqZWN0LmtleXMoYXR0cmlidXRlcyB8fCB7fSkuZm9yRWFjaChcblx0XHRcdGZ1bmN0aW9uIChuYW1lKSB7IHJldHVybiBpbWFnZS5zZXRBdHRyaWJ1dGUobmFtZSwgYXR0cmlidXRlc1tuYW1lXSk7IH1cblx0XHQpO1xuXHRcdGltYWdlLnNyYyA9IHNyYztcblx0fSBlbHNlIGlmIChpbWFnZS5sZW5ndGggIT09IHVuZGVmaW5lZCkge1xuXHRcdC8qIFRyZWF0IGFzIG11bHRpcGxlIGltYWdlcyAqL1xuXG5cdFx0Ly8gTW9tZW50YXJpbHkgaWdub3JlIGVycm9yc1xuXHRcdHZhciByZWZsZWN0ZWQgPSBbXS5tYXAuY2FsbChpbWFnZSwgZnVuY3Rpb24gKGltZykgeyByZXR1cm4gbG9hZChpbWcsIGF0dHJpYnV0ZXMpLmNhdGNoKGZ1bmN0aW9uIChlcnIpIHsgcmV0dXJuIGVycjsgfSk7IH0pO1xuXG5cdFx0cmV0dXJuIFByb21pc2UuYWxsKHJlZmxlY3RlZCkudGhlbihmdW5jdGlvbiAocmVzdWx0cykge1xuXHRcdFx0dmFyIGxvYWRlZCA9IHJlc3VsdHMuZmlsdGVyKGZ1bmN0aW9uICh4KSB7IHJldHVybiB4Lm5hdHVyYWxXaWR0aDsgfSk7XG5cdFx0XHRpZiAobG9hZGVkLmxlbmd0aCA9PT0gcmVzdWx0cy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIGxvYWRlZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdCh7XG5cdFx0XHRcdGxvYWRlZDogbG9hZGVkLFxuXHRcdFx0XHRlcnJvcmVkOiByZXN1bHRzLmZpbHRlcihmdW5jdGlvbiAoeCkgeyByZXR1cm4gIXgubmF0dXJhbFdpZHRoOyB9KVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0gZWxzZSBpZiAoaW1hZ2UudGFnTmFtZSAhPT0gJ0lNRycpIHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QoKTtcblx0fVxuXG5cdHZhciBwcm9taXNlID0gbmV3IFByb21pc2UoZnVuY3Rpb24gKHJlc29sdmUsIHJlamVjdCkge1xuXHRcdGlmIChpbWFnZS5uYXR1cmFsV2lkdGgpIHtcblx0XHRcdC8vIElmIHRoZSBicm93c2VyIGNhbiBkZXRlcm1pbmUgdGhlIG5hdHVyYWxXaWR0aCB0aGVcblx0XHRcdC8vIGltYWdlIGlzIGFscmVhZHkgbG9hZGVkIHN1Y2Nlc3NmdWxseVxuXHRcdFx0cmVzb2x2ZShpbWFnZSk7XG5cdFx0fSBlbHNlIGlmIChpbWFnZS5jb21wbGV0ZSkge1xuXHRcdFx0Ly8gSWYgdGhlIGltYWdlIGlzIGNvbXBsZXRlIGJ1dCB0aGUgbmF0dXJhbFdpZHRoIGlzIDBweFxuXHRcdFx0Ly8gaXQgaXMgcHJvYmFibHkgYnJva2VuXG5cdFx0XHRyZWplY3QoaW1hZ2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpbWFnZS5hZGRFdmVudExpc3RlbmVyKCdsb2FkJywgZnVsbGZpbGwpO1xuXHRcdFx0aW1hZ2UuYWRkRXZlbnRMaXN0ZW5lcignZXJyb3InLCBmdWxsZmlsbCk7XG5cdFx0fVxuXHRcdGZ1bmN0aW9uIGZ1bGxmaWxsKCkge1xuXHRcdFx0aWYgKGltYWdlLm5hdHVyYWxXaWR0aCkge1xuXHRcdFx0XHRyZXNvbHZlKGltYWdlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlamVjdChpbWFnZSk7XG5cdFx0XHR9XG5cdFx0XHRpbWFnZS5yZW1vdmVFdmVudExpc3RlbmVyKCdsb2FkJywgZnVsbGZpbGwpO1xuXHRcdFx0aW1hZ2UucmVtb3ZlRXZlbnRMaXN0ZW5lcignZXJyb3InLCBmdWxsZmlsbCk7XG5cdFx0fVxuXHR9KTtcblx0cHJvbWlzZS5pbWFnZSA9IGltYWdlO1xuXHRyZXR1cm4gcHJvbWlzZTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBsb2FkO1xuIiwiKGZ1bmN0aW9uIChnbG9iYWwsIGZhY3RvcnkpIHtcblx0dHlwZW9mIGV4cG9ydHMgPT09ICdvYmplY3QnICYmIHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnID8gbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KCkgOlxuXHR0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQgPyBkZWZpbmUoZmFjdG9yeSkgOlxuXHQoZ2xvYmFsLmNyZWF0ZVJFR0wgPSBmYWN0b3J5KCkpO1xufSh0aGlzLCAoZnVuY3Rpb24gKCkgeyAndXNlIHN0cmljdCc7XG5cbnZhciBpc1R5cGVkQXJyYXkgPSBmdW5jdGlvbiAoeCkge1xyXG4gIHJldHVybiAoXHJcbiAgICB4IGluc3RhbmNlb2YgVWludDhBcnJheSB8fFxyXG4gICAgeCBpbnN0YW5jZW9mIFVpbnQxNkFycmF5IHx8XHJcbiAgICB4IGluc3RhbmNlb2YgVWludDMyQXJyYXkgfHxcclxuICAgIHggaW5zdGFuY2VvZiBJbnQ4QXJyYXkgfHxcclxuICAgIHggaW5zdGFuY2VvZiBJbnQxNkFycmF5IHx8XHJcbiAgICB4IGluc3RhbmNlb2YgSW50MzJBcnJheSB8fFxyXG4gICAgeCBpbnN0YW5jZW9mIEZsb2F0MzJBcnJheSB8fFxyXG4gICAgeCBpbnN0YW5jZW9mIEZsb2F0NjRBcnJheSB8fFxyXG4gICAgeCBpbnN0YW5jZW9mIFVpbnQ4Q2xhbXBlZEFycmF5XHJcbiAgKVxyXG59O1xuXG52YXIgZXh0ZW5kID0gZnVuY3Rpb24gKGJhc2UsIG9wdHMpIHtcclxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKG9wdHMpO1xyXG4gIGZvciAodmFyIGkgPSAwOyBpIDwga2V5cy5sZW5ndGg7ICsraSkge1xyXG4gICAgYmFzZVtrZXlzW2ldXSA9IG9wdHNba2V5c1tpXV07XHJcbiAgfVxyXG4gIHJldHVybiBiYXNlXHJcbn07XG5cbi8vIEVycm9yIGNoZWNraW5nIGFuZCBwYXJhbWV0ZXIgdmFsaWRhdGlvbi5cclxuLy9cclxuLy8gU3RhdGVtZW50cyBmb3IgdGhlIGZvcm0gYGNoZWNrLnNvbWVQcm9jZWR1cmUoLi4uKWAgZ2V0IHJlbW92ZWQgYnlcclxuLy8gYSBicm93c2VyaWZ5IHRyYW5zZm9ybSBmb3Igb3B0aW1pemVkL21pbmlmaWVkIGJ1bmRsZXMuXHJcbi8vXHJcbi8qIGdsb2JhbHMgYXRvYiAqL1xyXG52YXIgZW5kbCA9ICdcXG4nO1xyXG5cclxuLy8gb25seSB1c2VkIGZvciBleHRyYWN0aW5nIHNoYWRlciBuYW1lcy4gIGlmIGF0b2Igbm90IHByZXNlbnQsIHRoZW4gZXJyb3JzXHJcbi8vIHdpbGwgYmUgc2xpZ2h0bHkgY3JhcHBpZXJcclxuZnVuY3Rpb24gZGVjb2RlQjY0IChzdHIpIHtcclxuICBpZiAodHlwZW9mIGF0b2IgIT09ICd1bmRlZmluZWQnKSB7XHJcbiAgICByZXR1cm4gYXRvYihzdHIpXHJcbiAgfVxyXG4gIHJldHVybiAnYmFzZTY0OicgKyBzdHJcclxufVxyXG5cclxuZnVuY3Rpb24gcmFpc2UgKG1lc3NhZ2UpIHtcclxuICB2YXIgZXJyb3IgPSBuZXcgRXJyb3IoJyhyZWdsKSAnICsgbWVzc2FnZSk7XHJcbiAgY29uc29sZS5lcnJvcihlcnJvcik7XHJcbiAgdGhyb3cgZXJyb3JcclxufVxyXG5cclxuZnVuY3Rpb24gY2hlY2sgKHByZWQsIG1lc3NhZ2UpIHtcclxuICBpZiAoIXByZWQpIHtcclxuICAgIHJhaXNlKG1lc3NhZ2UpO1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZW5jb2xvbiAobWVzc2FnZSkge1xyXG4gIGlmIChtZXNzYWdlKSB7XHJcbiAgICByZXR1cm4gJzogJyArIG1lc3NhZ2VcclxuICB9XHJcbiAgcmV0dXJuICcnXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNoZWNrUGFyYW1ldGVyIChwYXJhbSwgcG9zc2liaWxpdGllcywgbWVzc2FnZSkge1xyXG4gIGlmICghKHBhcmFtIGluIHBvc3NpYmlsaXRpZXMpKSB7XHJcbiAgICByYWlzZSgndW5rbm93biBwYXJhbWV0ZXIgKCcgKyBwYXJhbSArICcpJyArIGVuY29sb24obWVzc2FnZSkgK1xyXG4gICAgICAgICAgJy4gcG9zc2libGUgdmFsdWVzOiAnICsgT2JqZWN0LmtleXMocG9zc2liaWxpdGllcykuam9pbigpKTtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNoZWNrSXNUeXBlZEFycmF5IChkYXRhLCBtZXNzYWdlKSB7XHJcbiAgaWYgKCFpc1R5cGVkQXJyYXkoZGF0YSkpIHtcclxuICAgIHJhaXNlKFxyXG4gICAgICAnaW52YWxpZCBwYXJhbWV0ZXIgdHlwZScgKyBlbmNvbG9uKG1lc3NhZ2UpICtcclxuICAgICAgJy4gbXVzdCBiZSBhIHR5cGVkIGFycmF5Jyk7XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBjaGVja1R5cGVPZiAodmFsdWUsIHR5cGUsIG1lc3NhZ2UpIHtcclxuICBpZiAodHlwZW9mIHZhbHVlICE9PSB0eXBlKSB7XHJcbiAgICByYWlzZShcclxuICAgICAgJ2ludmFsaWQgcGFyYW1ldGVyIHR5cGUnICsgZW5jb2xvbihtZXNzYWdlKSArXHJcbiAgICAgICcuIGV4cGVjdGVkICcgKyB0eXBlICsgJywgZ290ICcgKyAodHlwZW9mIHZhbHVlKSk7XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBjaGVja05vbk5lZ2F0aXZlSW50ICh2YWx1ZSwgbWVzc2FnZSkge1xyXG4gIGlmICghKCh2YWx1ZSA+PSAwKSAmJlxyXG4gICAgICAgICgodmFsdWUgfCAwKSA9PT0gdmFsdWUpKSkge1xyXG4gICAgcmFpc2UoJ2ludmFsaWQgcGFyYW1ldGVyIHR5cGUsICgnICsgdmFsdWUgKyAnKScgKyBlbmNvbG9uKG1lc3NhZ2UpICtcclxuICAgICAgICAgICcuIG11c3QgYmUgYSBub25uZWdhdGl2ZSBpbnRlZ2VyJyk7XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBjaGVja09uZU9mICh2YWx1ZSwgbGlzdCwgbWVzc2FnZSkge1xyXG4gIGlmIChsaXN0LmluZGV4T2YodmFsdWUpIDwgMCkge1xyXG4gICAgcmFpc2UoJ2ludmFsaWQgdmFsdWUnICsgZW5jb2xvbihtZXNzYWdlKSArICcuIG11c3QgYmUgb25lIG9mOiAnICsgbGlzdCk7XHJcbiAgfVxyXG59XHJcblxyXG52YXIgY29uc3RydWN0b3JLZXlzID0gW1xyXG4gICdnbCcsXHJcbiAgJ2NhbnZhcycsXHJcbiAgJ2NvbnRhaW5lcicsXHJcbiAgJ2F0dHJpYnV0ZXMnLFxyXG4gICdwaXhlbFJhdGlvJyxcclxuICAnZXh0ZW5zaW9ucycsXHJcbiAgJ29wdGlvbmFsRXh0ZW5zaW9ucycsXHJcbiAgJ3Byb2ZpbGUnLFxyXG4gICdvbkRvbmUnXHJcbl07XHJcblxyXG5mdW5jdGlvbiBjaGVja0NvbnN0cnVjdG9yIChvYmopIHtcclxuICBPYmplY3Qua2V5cyhvYmopLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xyXG4gICAgaWYgKGNvbnN0cnVjdG9yS2V5cy5pbmRleE9mKGtleSkgPCAwKSB7XHJcbiAgICAgIHJhaXNlKCdpbnZhbGlkIHJlZ2wgY29uc3RydWN0b3IgYXJndW1lbnQgXCInICsga2V5ICsgJ1wiLiBtdXN0IGJlIG9uZSBvZiAnICsgY29uc3RydWN0b3JLZXlzKTtcclxuICAgIH1cclxuICB9KTtcclxufVxyXG5cclxuZnVuY3Rpb24gbGVmdFBhZCAoc3RyLCBuKSB7XHJcbiAgc3RyID0gc3RyICsgJyc7XHJcbiAgd2hpbGUgKHN0ci5sZW5ndGggPCBuKSB7XHJcbiAgICBzdHIgPSAnICcgKyBzdHI7XHJcbiAgfVxyXG4gIHJldHVybiBzdHJcclxufVxyXG5cclxuZnVuY3Rpb24gU2hhZGVyRmlsZSAoKSB7XHJcbiAgdGhpcy5uYW1lID0gJ3Vua25vd24nO1xyXG4gIHRoaXMubGluZXMgPSBbXTtcclxuICB0aGlzLmluZGV4ID0ge307XHJcbiAgdGhpcy5oYXNFcnJvcnMgPSBmYWxzZTtcclxufVxyXG5cclxuZnVuY3Rpb24gU2hhZGVyTGluZSAobnVtYmVyLCBsaW5lKSB7XHJcbiAgdGhpcy5udW1iZXIgPSBudW1iZXI7XHJcbiAgdGhpcy5saW5lID0gbGluZTtcclxuICB0aGlzLmVycm9ycyA9IFtdO1xyXG59XHJcblxyXG5mdW5jdGlvbiBTaGFkZXJFcnJvciAoZmlsZU51bWJlciwgbGluZU51bWJlciwgbWVzc2FnZSkge1xyXG4gIHRoaXMuZmlsZSA9IGZpbGVOdW1iZXI7XHJcbiAgdGhpcy5saW5lID0gbGluZU51bWJlcjtcclxuICB0aGlzLm1lc3NhZ2UgPSBtZXNzYWdlO1xyXG59XHJcblxyXG5mdW5jdGlvbiBndWVzc0NvbW1hbmQgKCkge1xyXG4gIHZhciBlcnJvciA9IG5ldyBFcnJvcigpO1xyXG4gIHZhciBzdGFjayA9IChlcnJvci5zdGFjayB8fCBlcnJvcikudG9TdHJpbmcoKTtcclxuICB2YXIgcGF0ID0gL2NvbXBpbGVQcm9jZWR1cmUuKlxcblxccyphdC4qXFwoKC4qKVxcKS8uZXhlYyhzdGFjayk7XHJcbiAgaWYgKHBhdCkge1xyXG4gICAgcmV0dXJuIHBhdFsxXVxyXG4gIH1cclxuICB2YXIgcGF0MiA9IC9jb21waWxlUHJvY2VkdXJlLipcXG5cXHMqYXRcXHMrKC4qKShcXG58JCkvLmV4ZWMoc3RhY2spO1xyXG4gIGlmIChwYXQyKSB7XHJcbiAgICByZXR1cm4gcGF0MlsxXVxyXG4gIH1cclxuICByZXR1cm4gJ3Vua25vd24nXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGd1ZXNzQ2FsbFNpdGUgKCkge1xyXG4gIHZhciBlcnJvciA9IG5ldyBFcnJvcigpO1xyXG4gIHZhciBzdGFjayA9IChlcnJvci5zdGFjayB8fCBlcnJvcikudG9TdHJpbmcoKTtcclxuICB2YXIgcGF0ID0gL2F0IFJFR0xDb21tYW5kLipcXG5cXHMrYXQuKlxcKCguKilcXCkvLmV4ZWMoc3RhY2spO1xyXG4gIGlmIChwYXQpIHtcclxuICAgIHJldHVybiBwYXRbMV1cclxuICB9XHJcbiAgdmFyIHBhdDIgPSAvYXQgUkVHTENvbW1hbmQuKlxcblxccythdFxccysoLiopXFxuLy5leGVjKHN0YWNrKTtcclxuICBpZiAocGF0Mikge1xyXG4gICAgcmV0dXJuIHBhdDJbMV1cclxuICB9XHJcbiAgcmV0dXJuICd1bmtub3duJ1xyXG59XHJcblxyXG5mdW5jdGlvbiBwYXJzZVNvdXJjZSAoc291cmNlLCBjb21tYW5kKSB7XHJcbiAgdmFyIGxpbmVzID0gc291cmNlLnNwbGl0KCdcXG4nKTtcclxuICB2YXIgbGluZU51bWJlciA9IDE7XHJcbiAgdmFyIGZpbGVOdW1iZXIgPSAwO1xyXG4gIHZhciBmaWxlcyA9IHtcclxuICAgIHVua25vd246IG5ldyBTaGFkZXJGaWxlKCksXHJcbiAgICAwOiBuZXcgU2hhZGVyRmlsZSgpXHJcbiAgfTtcclxuICBmaWxlcy51bmtub3duLm5hbWUgPSBmaWxlc1swXS5uYW1lID0gY29tbWFuZCB8fCBndWVzc0NvbW1hbmQoKTtcclxuICBmaWxlcy51bmtub3duLmxpbmVzLnB1c2gobmV3IFNoYWRlckxpbmUoMCwgJycpKTtcclxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxpbmVzLmxlbmd0aDsgKytpKSB7XHJcbiAgICB2YXIgbGluZSA9IGxpbmVzW2ldO1xyXG4gICAgdmFyIHBhcnRzID0gL15cXHMqXFwjXFxzKihcXHcrKVxccysoLispXFxzKiQvLmV4ZWMobGluZSk7XHJcbiAgICBpZiAocGFydHMpIHtcclxuICAgICAgc3dpdGNoIChwYXJ0c1sxXSkge1xyXG4gICAgICAgIGNhc2UgJ2xpbmUnOlxyXG4gICAgICAgICAgdmFyIGxpbmVOdW1iZXJJbmZvID0gLyhcXGQrKShcXHMrXFxkKyk/Ly5leGVjKHBhcnRzWzJdKTtcclxuICAgICAgICAgIGlmIChsaW5lTnVtYmVySW5mbykge1xyXG4gICAgICAgICAgICBsaW5lTnVtYmVyID0gbGluZU51bWJlckluZm9bMV0gfCAwO1xyXG4gICAgICAgICAgICBpZiAobGluZU51bWJlckluZm9bMl0pIHtcclxuICAgICAgICAgICAgICBmaWxlTnVtYmVyID0gbGluZU51bWJlckluZm9bMl0gfCAwO1xyXG4gICAgICAgICAgICAgIGlmICghKGZpbGVOdW1iZXIgaW4gZmlsZXMpKSB7XHJcbiAgICAgICAgICAgICAgICBmaWxlc1tmaWxlTnVtYmVyXSA9IG5ldyBTaGFkZXJGaWxlKCk7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBicmVha1xyXG4gICAgICAgIGNhc2UgJ2RlZmluZSc6XHJcbiAgICAgICAgICB2YXIgbmFtZUluZm8gPSAvU0hBREVSX05BTUUoX0I2NCk/XFxzKyguKikkLy5leGVjKHBhcnRzWzJdKTtcclxuICAgICAgICAgIGlmIChuYW1lSW5mbykge1xyXG4gICAgICAgICAgICBmaWxlc1tmaWxlTnVtYmVyXS5uYW1lID0gKG5hbWVJbmZvWzFdXHJcbiAgICAgICAgICAgICAgICA/IGRlY29kZUI2NChuYW1lSW5mb1syXSlcclxuICAgICAgICAgICAgICAgIDogbmFtZUluZm9bMl0pO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgYnJlYWtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgZmlsZXNbZmlsZU51bWJlcl0ubGluZXMucHVzaChuZXcgU2hhZGVyTGluZShsaW5lTnVtYmVyKyssIGxpbmUpKTtcclxuICB9XHJcbiAgT2JqZWN0LmtleXMoZmlsZXMpLmZvckVhY2goZnVuY3Rpb24gKGZpbGVOdW1iZXIpIHtcclxuICAgIHZhciBmaWxlID0gZmlsZXNbZmlsZU51bWJlcl07XHJcbiAgICBmaWxlLmxpbmVzLmZvckVhY2goZnVuY3Rpb24gKGxpbmUpIHtcclxuICAgICAgZmlsZS5pbmRleFtsaW5lLm51bWJlcl0gPSBsaW5lO1xyXG4gICAgfSk7XHJcbiAgfSk7XHJcbiAgcmV0dXJuIGZpbGVzXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHBhcnNlRXJyb3JMb2cgKGVyckxvZykge1xyXG4gIHZhciByZXN1bHQgPSBbXTtcclxuICBlcnJMb2cuc3BsaXQoJ1xcbicpLmZvckVhY2goZnVuY3Rpb24gKGVyck1zZykge1xyXG4gICAgaWYgKGVyck1zZy5sZW5ndGggPCA1KSB7XHJcbiAgICAgIHJldHVyblxyXG4gICAgfVxyXG4gICAgdmFyIHBhcnRzID0gL15FUlJPUlxcOlxccysoXFxkKylcXDooXFxkKylcXDpcXHMqKC4qKSQvLmV4ZWMoZXJyTXNnKTtcclxuICAgIGlmIChwYXJ0cykge1xyXG4gICAgICByZXN1bHQucHVzaChuZXcgU2hhZGVyRXJyb3IoXHJcbiAgICAgICAgcGFydHNbMV0gfCAwLFxyXG4gICAgICAgIHBhcnRzWzJdIHwgMCxcclxuICAgICAgICBwYXJ0c1szXS50cmltKCkpKTtcclxuICAgIH0gZWxzZSBpZiAoZXJyTXNnLmxlbmd0aCA+IDApIHtcclxuICAgICAgcmVzdWx0LnB1c2gobmV3IFNoYWRlckVycm9yKCd1bmtub3duJywgMCwgZXJyTXNnKSk7XHJcbiAgICB9XHJcbiAgfSk7XHJcbiAgcmV0dXJuIHJlc3VsdFxyXG59XHJcblxyXG5mdW5jdGlvbiBhbm5vdGF0ZUZpbGVzIChmaWxlcywgZXJyb3JzKSB7XHJcbiAgZXJyb3JzLmZvckVhY2goZnVuY3Rpb24gKGVycm9yKSB7XHJcbiAgICB2YXIgZmlsZSA9IGZpbGVzW2Vycm9yLmZpbGVdO1xyXG4gICAgaWYgKGZpbGUpIHtcclxuICAgICAgdmFyIGxpbmUgPSBmaWxlLmluZGV4W2Vycm9yLmxpbmVdO1xyXG4gICAgICBpZiAobGluZSkge1xyXG4gICAgICAgIGxpbmUuZXJyb3JzLnB1c2goZXJyb3IpO1xyXG4gICAgICAgIGZpbGUuaGFzRXJyb3JzID0gdHJ1ZTtcclxuICAgICAgICByZXR1cm5cclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgZmlsZXMudW5rbm93bi5oYXNFcnJvcnMgPSB0cnVlO1xyXG4gICAgZmlsZXMudW5rbm93bi5saW5lc1swXS5lcnJvcnMucHVzaChlcnJvcik7XHJcbiAgfSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNoZWNrU2hhZGVyRXJyb3IgKGdsLCBzaGFkZXIsIHNvdXJjZSwgdHlwZSwgY29tbWFuZCkge1xyXG4gIGlmICghZ2wuZ2V0U2hhZGVyUGFyYW1ldGVyKHNoYWRlciwgZ2wuQ09NUElMRV9TVEFUVVMpKSB7XHJcbiAgICB2YXIgZXJyTG9nID0gZ2wuZ2V0U2hhZGVySW5mb0xvZyhzaGFkZXIpO1xyXG4gICAgdmFyIHR5cGVOYW1lID0gdHlwZSA9PT0gZ2wuRlJBR01FTlRfU0hBREVSID8gJ2ZyYWdtZW50JyA6ICd2ZXJ0ZXgnO1xyXG4gICAgY2hlY2tDb21tYW5kVHlwZShzb3VyY2UsICdzdHJpbmcnLCB0eXBlTmFtZSArICcgc2hhZGVyIHNvdXJjZSBtdXN0IGJlIGEgc3RyaW5nJywgY29tbWFuZCk7XHJcbiAgICB2YXIgZmlsZXMgPSBwYXJzZVNvdXJjZShzb3VyY2UsIGNvbW1hbmQpO1xyXG4gICAgdmFyIGVycm9ycyA9IHBhcnNlRXJyb3JMb2coZXJyTG9nKTtcclxuICAgIGFubm90YXRlRmlsZXMoZmlsZXMsIGVycm9ycyk7XHJcblxyXG4gICAgT2JqZWN0LmtleXMoZmlsZXMpLmZvckVhY2goZnVuY3Rpb24gKGZpbGVOdW1iZXIpIHtcclxuICAgICAgdmFyIGZpbGUgPSBmaWxlc1tmaWxlTnVtYmVyXTtcclxuICAgICAgaWYgKCFmaWxlLmhhc0Vycm9ycykge1xyXG4gICAgICAgIHJldHVyblxyXG4gICAgICB9XHJcblxyXG4gICAgICB2YXIgc3RyaW5ncyA9IFsnJ107XHJcbiAgICAgIHZhciBzdHlsZXMgPSBbJyddO1xyXG5cclxuICAgICAgZnVuY3Rpb24gcHVzaCAoc3RyLCBzdHlsZSkge1xyXG4gICAgICAgIHN0cmluZ3MucHVzaChzdHIpO1xyXG4gICAgICAgIHN0eWxlcy5wdXNoKHN0eWxlIHx8ICcnKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgcHVzaCgnZmlsZSBudW1iZXIgJyArIGZpbGVOdW1iZXIgKyAnOiAnICsgZmlsZS5uYW1lICsgJ1xcbicsICdjb2xvcjpyZWQ7dGV4dC1kZWNvcmF0aW9uOnVuZGVybGluZTtmb250LXdlaWdodDpib2xkJyk7XHJcblxyXG4gICAgICBmaWxlLmxpbmVzLmZvckVhY2goZnVuY3Rpb24gKGxpbmUpIHtcclxuICAgICAgICBpZiAobGluZS5lcnJvcnMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgcHVzaChsZWZ0UGFkKGxpbmUubnVtYmVyLCA0KSArICd8ICAnLCAnYmFja2dyb3VuZC1jb2xvcjp5ZWxsb3c7IGZvbnQtd2VpZ2h0OmJvbGQnKTtcclxuICAgICAgICAgIHB1c2gobGluZS5saW5lICsgZW5kbCwgJ2NvbG9yOnJlZDsgYmFja2dyb3VuZC1jb2xvcjp5ZWxsb3c7IGZvbnQtd2VpZ2h0OmJvbGQnKTtcclxuXHJcbiAgICAgICAgICAvLyB0cnkgdG8gZ3Vlc3MgdG9rZW5cclxuICAgICAgICAgIHZhciBvZmZzZXQgPSAwO1xyXG4gICAgICAgICAgbGluZS5lcnJvcnMuZm9yRWFjaChmdW5jdGlvbiAoZXJyb3IpIHtcclxuICAgICAgICAgICAgdmFyIG1lc3NhZ2UgPSBlcnJvci5tZXNzYWdlO1xyXG4gICAgICAgICAgICB2YXIgdG9rZW4gPSAvXlxccypcXCcoLiopXFwnXFxzKlxcOlxccyooLiopJC8uZXhlYyhtZXNzYWdlKTtcclxuICAgICAgICAgICAgaWYgKHRva2VuKSB7XHJcbiAgICAgICAgICAgICAgdmFyIHRva2VuUGF0ID0gdG9rZW5bMV07XHJcbiAgICAgICAgICAgICAgbWVzc2FnZSA9IHRva2VuWzJdO1xyXG4gICAgICAgICAgICAgIHN3aXRjaCAodG9rZW5QYXQpIHtcclxuICAgICAgICAgICAgICAgIGNhc2UgJ2Fzc2lnbic6XHJcbiAgICAgICAgICAgICAgICAgIHRva2VuUGF0ID0gJz0nO1xyXG4gICAgICAgICAgICAgICAgICBicmVha1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICBvZmZzZXQgPSBNYXRoLm1heChsaW5lLmxpbmUuaW5kZXhPZih0b2tlblBhdCwgb2Zmc2V0KSwgMCk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgb2Zmc2V0ID0gMDtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgcHVzaChsZWZ0UGFkKCd8ICcsIDYpKTtcclxuICAgICAgICAgICAgcHVzaChsZWZ0UGFkKCdeXl4nLCBvZmZzZXQgKyAzKSArIGVuZGwsICdmb250LXdlaWdodDpib2xkJyk7XHJcbiAgICAgICAgICAgIHB1c2gobGVmdFBhZCgnfCAnLCA2KSk7XHJcbiAgICAgICAgICAgIHB1c2gobWVzc2FnZSArIGVuZGwsICdmb250LXdlaWdodDpib2xkJyk7XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICAgIHB1c2gobGVmdFBhZCgnfCAnLCA2KSArIGVuZGwpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBwdXNoKGxlZnRQYWQobGluZS5udW1iZXIsIDQpICsgJ3wgICcpO1xyXG4gICAgICAgICAgcHVzaChsaW5lLmxpbmUgKyBlbmRsLCAnY29sb3I6cmVkJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuICAgICAgaWYgKHR5cGVvZiBkb2N1bWVudCAhPT0gJ3VuZGVmaW5lZCcgJiYgIXdpbmRvdy5jaHJvbWUpIHtcclxuICAgICAgICBzdHlsZXNbMF0gPSBzdHJpbmdzLmpvaW4oJyVjJyk7XHJcbiAgICAgICAgY29uc29sZS5sb2cuYXBwbHkoY29uc29sZSwgc3R5bGVzKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhzdHJpbmdzLmpvaW4oJycpKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgY2hlY2sucmFpc2UoJ0Vycm9yIGNvbXBpbGluZyAnICsgdHlwZU5hbWUgKyAnIHNoYWRlciwgJyArIGZpbGVzWzBdLm5hbWUpO1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gY2hlY2tMaW5rRXJyb3IgKGdsLCBwcm9ncmFtLCBmcmFnU2hhZGVyLCB2ZXJ0U2hhZGVyLCBjb21tYW5kKSB7XHJcbiAgaWYgKCFnbC5nZXRQcm9ncmFtUGFyYW1ldGVyKHByb2dyYW0sIGdsLkxJTktfU1RBVFVTKSkge1xyXG4gICAgdmFyIGVyckxvZyA9IGdsLmdldFByb2dyYW1JbmZvTG9nKHByb2dyYW0pO1xyXG4gICAgdmFyIGZyYWdQYXJzZSA9IHBhcnNlU291cmNlKGZyYWdTaGFkZXIsIGNvbW1hbmQpO1xyXG4gICAgdmFyIHZlcnRQYXJzZSA9IHBhcnNlU291cmNlKHZlcnRTaGFkZXIsIGNvbW1hbmQpO1xyXG5cclxuICAgIHZhciBoZWFkZXIgPSAnRXJyb3IgbGlua2luZyBwcm9ncmFtIHdpdGggdmVydGV4IHNoYWRlciwgXCInICtcclxuICAgICAgdmVydFBhcnNlWzBdLm5hbWUgKyAnXCIsIGFuZCBmcmFnbWVudCBzaGFkZXIgXCInICsgZnJhZ1BhcnNlWzBdLm5hbWUgKyAnXCInO1xyXG5cclxuICAgIGlmICh0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCclYycgKyBoZWFkZXIgKyBlbmRsICsgJyVjJyArIGVyckxvZyxcclxuICAgICAgICAnY29sb3I6cmVkO3RleHQtZGVjb3JhdGlvbjp1bmRlcmxpbmU7Zm9udC13ZWlnaHQ6Ym9sZCcsXHJcbiAgICAgICAgJ2NvbG9yOnJlZCcpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY29uc29sZS5sb2coaGVhZGVyICsgZW5kbCArIGVyckxvZyk7XHJcbiAgICB9XHJcbiAgICBjaGVjay5yYWlzZShoZWFkZXIpO1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gc2F2ZUNvbW1hbmRSZWYgKG9iamVjdCkge1xyXG4gIG9iamVjdC5fY29tbWFuZFJlZiA9IGd1ZXNzQ29tbWFuZCgpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzYXZlRHJhd0NvbW1hbmRJbmZvIChvcHRzLCB1bmlmb3JtcywgYXR0cmlidXRlcywgc3RyaW5nU3RvcmUpIHtcclxuICBzYXZlQ29tbWFuZFJlZihvcHRzKTtcclxuXHJcbiAgZnVuY3Rpb24gaWQgKHN0cikge1xyXG4gICAgaWYgKHN0cikge1xyXG4gICAgICByZXR1cm4gc3RyaW5nU3RvcmUuaWQoc3RyKVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIDBcclxuICB9XHJcbiAgb3B0cy5fZnJhZ0lkID0gaWQob3B0cy5zdGF0aWMuZnJhZyk7XHJcbiAgb3B0cy5fdmVydElkID0gaWQob3B0cy5zdGF0aWMudmVydCk7XHJcblxyXG4gIGZ1bmN0aW9uIGFkZFByb3BzIChkaWN0LCBzZXQpIHtcclxuICAgIE9iamVjdC5rZXlzKHNldCkuZm9yRWFjaChmdW5jdGlvbiAodSkge1xyXG4gICAgICBkaWN0W3N0cmluZ1N0b3JlLmlkKHUpXSA9IHRydWU7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIHZhciB1bmlmb3JtU2V0ID0gb3B0cy5fdW5pZm9ybVNldCA9IHt9O1xyXG4gIGFkZFByb3BzKHVuaWZvcm1TZXQsIHVuaWZvcm1zLnN0YXRpYyk7XHJcbiAgYWRkUHJvcHModW5pZm9ybVNldCwgdW5pZm9ybXMuZHluYW1pYyk7XHJcblxyXG4gIHZhciBhdHRyaWJ1dGVTZXQgPSBvcHRzLl9hdHRyaWJ1dGVTZXQgPSB7fTtcclxuICBhZGRQcm9wcyhhdHRyaWJ1dGVTZXQsIGF0dHJpYnV0ZXMuc3RhdGljKTtcclxuICBhZGRQcm9wcyhhdHRyaWJ1dGVTZXQsIGF0dHJpYnV0ZXMuZHluYW1pYyk7XHJcblxyXG4gIG9wdHMuX2hhc0NvdW50ID0gKFxyXG4gICAgJ2NvdW50JyBpbiBvcHRzLnN0YXRpYyB8fFxyXG4gICAgJ2NvdW50JyBpbiBvcHRzLmR5bmFtaWMgfHxcclxuICAgICdlbGVtZW50cycgaW4gb3B0cy5zdGF0aWMgfHxcclxuICAgICdlbGVtZW50cycgaW4gb3B0cy5keW5hbWljKTtcclxufVxyXG5cclxuZnVuY3Rpb24gY29tbWFuZFJhaXNlIChtZXNzYWdlLCBjb21tYW5kKSB7XHJcbiAgdmFyIGNhbGxTaXRlID0gZ3Vlc3NDYWxsU2l0ZSgpO1xyXG4gIHJhaXNlKG1lc3NhZ2UgK1xyXG4gICAgJyBpbiBjb21tYW5kICcgKyAoY29tbWFuZCB8fCBndWVzc0NvbW1hbmQoKSkgK1xyXG4gICAgKGNhbGxTaXRlID09PSAndW5rbm93bicgPyAnJyA6ICcgY2FsbGVkIGZyb20gJyArIGNhbGxTaXRlKSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNoZWNrQ29tbWFuZCAocHJlZCwgbWVzc2FnZSwgY29tbWFuZCkge1xyXG4gIGlmICghcHJlZCkge1xyXG4gICAgY29tbWFuZFJhaXNlKG1lc3NhZ2UsIGNvbW1hbmQgfHwgZ3Vlc3NDb21tYW5kKCkpO1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gY2hlY2tQYXJhbWV0ZXJDb21tYW5kIChwYXJhbSwgcG9zc2liaWxpdGllcywgbWVzc2FnZSwgY29tbWFuZCkge1xyXG4gIGlmICghKHBhcmFtIGluIHBvc3NpYmlsaXRpZXMpKSB7XHJcbiAgICBjb21tYW5kUmFpc2UoXHJcbiAgICAgICd1bmtub3duIHBhcmFtZXRlciAoJyArIHBhcmFtICsgJyknICsgZW5jb2xvbihtZXNzYWdlKSArXHJcbiAgICAgICcuIHBvc3NpYmxlIHZhbHVlczogJyArIE9iamVjdC5rZXlzKHBvc3NpYmlsaXRpZXMpLmpvaW4oKSxcclxuICAgICAgY29tbWFuZCB8fCBndWVzc0NvbW1hbmQoKSk7XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBjaGVja0NvbW1hbmRUeXBlICh2YWx1ZSwgdHlwZSwgbWVzc2FnZSwgY29tbWFuZCkge1xyXG4gIGlmICh0eXBlb2YgdmFsdWUgIT09IHR5cGUpIHtcclxuICAgIGNvbW1hbmRSYWlzZShcclxuICAgICAgJ2ludmFsaWQgcGFyYW1ldGVyIHR5cGUnICsgZW5jb2xvbihtZXNzYWdlKSArXHJcbiAgICAgICcuIGV4cGVjdGVkICcgKyB0eXBlICsgJywgZ290ICcgKyAodHlwZW9mIHZhbHVlKSxcclxuICAgICAgY29tbWFuZCB8fCBndWVzc0NvbW1hbmQoKSk7XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBjaGVja09wdGlvbmFsIChibG9jaykge1xyXG4gIGJsb2NrKCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNoZWNrRnJhbWVidWZmZXJGb3JtYXQgKGF0dGFjaG1lbnQsIHRleEZvcm1hdHMsIHJiRm9ybWF0cykge1xyXG4gIGlmIChhdHRhY2htZW50LnRleHR1cmUpIHtcclxuICAgIGNoZWNrT25lT2YoXHJcbiAgICAgIGF0dGFjaG1lbnQudGV4dHVyZS5fdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCxcclxuICAgICAgdGV4Rm9ybWF0cyxcclxuICAgICAgJ3Vuc3VwcG9ydGVkIHRleHR1cmUgZm9ybWF0IGZvciBhdHRhY2htZW50Jyk7XHJcbiAgfSBlbHNlIHtcclxuICAgIGNoZWNrT25lT2YoXHJcbiAgICAgIGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIuZm9ybWF0LFxyXG4gICAgICByYkZvcm1hdHMsXHJcbiAgICAgICd1bnN1cHBvcnRlZCByZW5kZXJidWZmZXIgZm9ybWF0IGZvciBhdHRhY2htZW50Jyk7XHJcbiAgfVxyXG59XHJcblxyXG52YXIgR0xfQ0xBTVBfVE9fRURHRSA9IDB4ODEyRjtcclxuXHJcbnZhciBHTF9ORUFSRVNUID0gMHgyNjAwO1xyXG52YXIgR0xfTkVBUkVTVF9NSVBNQVBfTkVBUkVTVCA9IDB4MjcwMDtcclxudmFyIEdMX0xJTkVBUl9NSVBNQVBfTkVBUkVTVCA9IDB4MjcwMTtcclxudmFyIEdMX05FQVJFU1RfTUlQTUFQX0xJTkVBUiA9IDB4MjcwMjtcclxudmFyIEdMX0xJTkVBUl9NSVBNQVBfTElORUFSID0gMHgyNzAzO1xyXG5cclxudmFyIEdMX0JZVEUgPSA1MTIwO1xyXG52YXIgR0xfVU5TSUdORURfQllURSA9IDUxMjE7XHJcbnZhciBHTF9TSE9SVCA9IDUxMjI7XHJcbnZhciBHTF9VTlNJR05FRF9TSE9SVCA9IDUxMjM7XHJcbnZhciBHTF9JTlQgPSA1MTI0O1xyXG52YXIgR0xfVU5TSUdORURfSU5UID0gNTEyNTtcclxudmFyIEdMX0ZMT0FUID0gNTEyNjtcclxuXHJcbnZhciBHTF9VTlNJR05FRF9TSE9SVF80XzRfNF80ID0gMHg4MDMzO1xyXG52YXIgR0xfVU5TSUdORURfU0hPUlRfNV81XzVfMSA9IDB4ODAzNDtcclxudmFyIEdMX1VOU0lHTkVEX1NIT1JUXzVfNl81ID0gMHg4MzYzO1xyXG52YXIgR0xfVU5TSUdORURfSU5UXzI0XzhfV0VCR0wgPSAweDg0RkE7XHJcblxyXG52YXIgR0xfSEFMRl9GTE9BVF9PRVMgPSAweDhENjE7XHJcblxyXG52YXIgVFlQRV9TSVpFID0ge307XHJcblxyXG5UWVBFX1NJWkVbR0xfQllURV0gPVxyXG5UWVBFX1NJWkVbR0xfVU5TSUdORURfQllURV0gPSAxO1xyXG5cclxuVFlQRV9TSVpFW0dMX1NIT1JUXSA9XHJcblRZUEVfU0laRVtHTF9VTlNJR05FRF9TSE9SVF0gPVxyXG5UWVBFX1NJWkVbR0xfSEFMRl9GTE9BVF9PRVNdID1cclxuVFlQRV9TSVpFW0dMX1VOU0lHTkVEX1NIT1JUXzVfNl81XSA9XHJcblRZUEVfU0laRVtHTF9VTlNJR05FRF9TSE9SVF80XzRfNF80XSA9XHJcblRZUEVfU0laRVtHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xXSA9IDI7XHJcblxyXG5UWVBFX1NJWkVbR0xfSU5UXSA9XHJcblRZUEVfU0laRVtHTF9VTlNJR05FRF9JTlRdID1cclxuVFlQRV9TSVpFW0dMX0ZMT0FUXSA9XHJcblRZUEVfU0laRVtHTF9VTlNJR05FRF9JTlRfMjRfOF9XRUJHTF0gPSA0O1xyXG5cclxuZnVuY3Rpb24gcGl4ZWxTaXplICh0eXBlLCBjaGFubmVscykge1xyXG4gIGlmICh0eXBlID09PSBHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xIHx8XHJcbiAgICAgIHR5cGUgPT09IEdMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzQgfHxcclxuICAgICAgdHlwZSA9PT0gR0xfVU5TSUdORURfU0hPUlRfNV82XzUpIHtcclxuICAgIHJldHVybiAyXHJcbiAgfSBlbHNlIGlmICh0eXBlID09PSBHTF9VTlNJR05FRF9JTlRfMjRfOF9XRUJHTCkge1xyXG4gICAgcmV0dXJuIDRcclxuICB9IGVsc2Uge1xyXG4gICAgcmV0dXJuIFRZUEVfU0laRVt0eXBlXSAqIGNoYW5uZWxzXHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBpc1BvdzIgKHYpIHtcclxuICByZXR1cm4gISh2ICYgKHYgLSAxKSkgJiYgKCEhdilcclxufVxyXG5cclxuZnVuY3Rpb24gY2hlY2tUZXh0dXJlMkQgKGluZm8sIG1pcERhdGEsIGxpbWl0cykge1xyXG4gIHZhciBpO1xyXG4gIHZhciB3ID0gbWlwRGF0YS53aWR0aDtcclxuICB2YXIgaCA9IG1pcERhdGEuaGVpZ2h0O1xyXG4gIHZhciBjID0gbWlwRGF0YS5jaGFubmVscztcclxuXHJcbiAgLy8gQ2hlY2sgdGV4dHVyZSBzaGFwZVxyXG4gIGNoZWNrKHcgPiAwICYmIHcgPD0gbGltaXRzLm1heFRleHR1cmVTaXplICYmXHJcbiAgICAgICAgaCA+IDAgJiYgaCA8PSBsaW1pdHMubWF4VGV4dHVyZVNpemUsXHJcbiAgICAgICAgJ2ludmFsaWQgdGV4dHVyZSBzaGFwZScpO1xyXG5cclxuICAvLyBjaGVjayB3cmFwIG1vZGVcclxuICBpZiAoaW5mby53cmFwUyAhPT0gR0xfQ0xBTVBfVE9fRURHRSB8fCBpbmZvLndyYXBUICE9PSBHTF9DTEFNUF9UT19FREdFKSB7XHJcbiAgICBjaGVjayhpc1BvdzIodykgJiYgaXNQb3cyKGgpLFxyXG4gICAgICAnaW5jb21wYXRpYmxlIHdyYXAgbW9kZSBmb3IgdGV4dHVyZSwgYm90aCB3aWR0aCBhbmQgaGVpZ2h0IG11c3QgYmUgcG93ZXIgb2YgMicpO1xyXG4gIH1cclxuXHJcbiAgaWYgKG1pcERhdGEubWlwbWFzayA9PT0gMSkge1xyXG4gICAgaWYgKHcgIT09IDEgJiYgaCAhPT0gMSkge1xyXG4gICAgICBjaGVjayhcclxuICAgICAgICBpbmZvLm1pbkZpbHRlciAhPT0gR0xfTkVBUkVTVF9NSVBNQVBfTkVBUkVTVCAmJlxyXG4gICAgICAgIGluZm8ubWluRmlsdGVyICE9PSBHTF9ORUFSRVNUX01JUE1BUF9MSU5FQVIgJiZcclxuICAgICAgICBpbmZvLm1pbkZpbHRlciAhPT0gR0xfTElORUFSX01JUE1BUF9ORUFSRVNUICYmXHJcbiAgICAgICAgaW5mby5taW5GaWx0ZXIgIT09IEdMX0xJTkVBUl9NSVBNQVBfTElORUFSLFxyXG4gICAgICAgICdtaW4gZmlsdGVyIHJlcXVpcmVzIG1pcG1hcCcpO1xyXG4gICAgfVxyXG4gIH0gZWxzZSB7XHJcbiAgICAvLyB0ZXh0dXJlIG11c3QgYmUgcG93ZXIgb2YgMlxyXG4gICAgY2hlY2soaXNQb3cyKHcpICYmIGlzUG93MihoKSxcclxuICAgICAgJ3RleHR1cmUgbXVzdCBiZSBhIHNxdWFyZSBwb3dlciBvZiAyIHRvIHN1cHBvcnQgbWlwbWFwcGluZycpO1xyXG4gICAgY2hlY2sobWlwRGF0YS5taXBtYXNrID09PSAodyA8PCAxKSAtIDEsXHJcbiAgICAgICdtaXNzaW5nIG9yIGluY29tcGxldGUgbWlwbWFwIGRhdGEnKTtcclxuICB9XHJcblxyXG4gIGlmIChtaXBEYXRhLnR5cGUgPT09IEdMX0ZMT0FUKSB7XHJcbiAgICBpZiAobGltaXRzLmV4dGVuc2lvbnMuaW5kZXhPZignb2VzX3RleHR1cmVfZmxvYXRfbGluZWFyJykgPCAwKSB7XHJcbiAgICAgIGNoZWNrKGluZm8ubWluRmlsdGVyID09PSBHTF9ORUFSRVNUICYmIGluZm8ubWFnRmlsdGVyID09PSBHTF9ORUFSRVNULFxyXG4gICAgICAgICdmaWx0ZXIgbm90IHN1cHBvcnRlZCwgbXVzdCBlbmFibGUgb2VzX3RleHR1cmVfZmxvYXRfbGluZWFyJyk7XHJcbiAgICB9XHJcbiAgICBjaGVjayghaW5mby5nZW5NaXBtYXBzLFxyXG4gICAgICAnbWlwbWFwIGdlbmVyYXRpb24gbm90IHN1cHBvcnRlZCB3aXRoIGZsb2F0IHRleHR1cmVzJyk7XHJcbiAgfVxyXG5cclxuICAvLyBjaGVjayBpbWFnZSBjb21wbGV0ZVxyXG4gIHZhciBtaXBpbWFnZXMgPSBtaXBEYXRhLmltYWdlcztcclxuICBmb3IgKGkgPSAwOyBpIDwgMTY7ICsraSkge1xyXG4gICAgaWYgKG1pcGltYWdlc1tpXSkge1xyXG4gICAgICB2YXIgbXcgPSB3ID4+IGk7XHJcbiAgICAgIHZhciBtaCA9IGggPj4gaTtcclxuICAgICAgY2hlY2sobWlwRGF0YS5taXBtYXNrICYgKDEgPDwgaSksICdtaXNzaW5nIG1pcG1hcCBkYXRhJyk7XHJcblxyXG4gICAgICB2YXIgaW1nID0gbWlwaW1hZ2VzW2ldO1xyXG5cclxuICAgICAgY2hlY2soXHJcbiAgICAgICAgaW1nLndpZHRoID09PSBtdyAmJlxyXG4gICAgICAgIGltZy5oZWlnaHQgPT09IG1oLFxyXG4gICAgICAgICdpbnZhbGlkIHNoYXBlIGZvciBtaXAgaW1hZ2VzJyk7XHJcblxyXG4gICAgICBjaGVjayhcclxuICAgICAgICBpbWcuZm9ybWF0ID09PSBtaXBEYXRhLmZvcm1hdCAmJlxyXG4gICAgICAgIGltZy5pbnRlcm5hbGZvcm1hdCA9PT0gbWlwRGF0YS5pbnRlcm5hbGZvcm1hdCAmJlxyXG4gICAgICAgIGltZy50eXBlID09PSBtaXBEYXRhLnR5cGUsXHJcbiAgICAgICAgJ2luY29tcGF0aWJsZSB0eXBlIGZvciBtaXAgaW1hZ2UnKTtcclxuXHJcbiAgICAgIGlmIChpbWcuY29tcHJlc3NlZCkge1xyXG4gICAgICAgIC8vIFRPRE86IGNoZWNrIHNpemUgZm9yIGNvbXByZXNzZWQgaW1hZ2VzXHJcbiAgICAgIH0gZWxzZSBpZiAoaW1nLmRhdGEpIHtcclxuICAgICAgICAvLyBjaGVjayhpbWcuZGF0YS5ieXRlTGVuZ3RoID09PSBtdyAqIG1oICpcclxuICAgICAgICAvLyBNYXRoLm1heChwaXhlbFNpemUoaW1nLnR5cGUsIGMpLCBpbWcudW5wYWNrQWxpZ25tZW50KSxcclxuICAgICAgICB2YXIgcm93U2l6ZSA9IE1hdGguY2VpbChwaXhlbFNpemUoaW1nLnR5cGUsIGMpICogbXcgLyBpbWcudW5wYWNrQWxpZ25tZW50KSAqIGltZy51bnBhY2tBbGlnbm1lbnQ7XHJcbiAgICAgICAgY2hlY2soaW1nLmRhdGEuYnl0ZUxlbmd0aCA9PT0gcm93U2l6ZSAqIG1oLFxyXG4gICAgICAgICAgJ2ludmFsaWQgZGF0YSBmb3IgaW1hZ2UsIGJ1ZmZlciBzaXplIGlzIGluY29uc2lzdGVudCB3aXRoIGltYWdlIGZvcm1hdCcpO1xyXG4gICAgICB9IGVsc2UgaWYgKGltZy5lbGVtZW50KSB7XHJcbiAgICAgICAgLy8gVE9ETzogY2hlY2sgZWxlbWVudCBjYW4gYmUgbG9hZGVkXHJcbiAgICAgIH0gZWxzZSBpZiAoaW1nLmNvcHkpIHtcclxuICAgICAgICAvLyBUT0RPOiBjaGVjayBjb21wYXRpYmxlIGZvcm1hdCBhbmQgdHlwZVxyXG4gICAgICB9XHJcbiAgICB9IGVsc2UgaWYgKCFpbmZvLmdlbk1pcG1hcHMpIHtcclxuICAgICAgY2hlY2soKG1pcERhdGEubWlwbWFzayAmICgxIDw8IGkpKSA9PT0gMCwgJ2V4dHJhIG1pcG1hcCBkYXRhJyk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBpZiAobWlwRGF0YS5jb21wcmVzc2VkKSB7XHJcbiAgICBjaGVjayghaW5mby5nZW5NaXBtYXBzLFxyXG4gICAgICAnbWlwbWFwIGdlbmVyYXRpb24gZm9yIGNvbXByZXNzZWQgaW1hZ2VzIG5vdCBzdXBwb3J0ZWQnKTtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNoZWNrVGV4dHVyZUN1YmUgKHRleHR1cmUsIGluZm8sIGZhY2VzLCBsaW1pdHMpIHtcclxuICB2YXIgdyA9IHRleHR1cmUud2lkdGg7XHJcbiAgdmFyIGggPSB0ZXh0dXJlLmhlaWdodDtcclxuICB2YXIgYyA9IHRleHR1cmUuY2hhbm5lbHM7XHJcblxyXG4gIC8vIENoZWNrIHRleHR1cmUgc2hhcGVcclxuICBjaGVjayhcclxuICAgIHcgPiAwICYmIHcgPD0gbGltaXRzLm1heFRleHR1cmVTaXplICYmIGggPiAwICYmIGggPD0gbGltaXRzLm1heFRleHR1cmVTaXplLFxyXG4gICAgJ2ludmFsaWQgdGV4dHVyZSBzaGFwZScpO1xyXG4gIGNoZWNrKFxyXG4gICAgdyA9PT0gaCxcclxuICAgICdjdWJlIG1hcCBtdXN0IGJlIHNxdWFyZScpO1xyXG4gIGNoZWNrKFxyXG4gICAgaW5mby53cmFwUyA9PT0gR0xfQ0xBTVBfVE9fRURHRSAmJiBpbmZvLndyYXBUID09PSBHTF9DTEFNUF9UT19FREdFLFxyXG4gICAgJ3dyYXAgbW9kZSBub3Qgc3VwcG9ydGVkIGJ5IGN1YmUgbWFwJyk7XHJcblxyXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgZmFjZXMubGVuZ3RoOyArK2kpIHtcclxuICAgIHZhciBmYWNlID0gZmFjZXNbaV07XHJcbiAgICBjaGVjayhcclxuICAgICAgZmFjZS53aWR0aCA9PT0gdyAmJiBmYWNlLmhlaWdodCA9PT0gaCxcclxuICAgICAgJ2luY29uc2lzdGVudCBjdWJlIG1hcCBmYWNlIHNoYXBlJyk7XHJcblxyXG4gICAgaWYgKGluZm8uZ2VuTWlwbWFwcykge1xyXG4gICAgICBjaGVjayghZmFjZS5jb21wcmVzc2VkLFxyXG4gICAgICAgICdjYW4gbm90IGdlbmVyYXRlIG1pcG1hcCBmb3IgY29tcHJlc3NlZCB0ZXh0dXJlcycpO1xyXG4gICAgICBjaGVjayhmYWNlLm1pcG1hc2sgPT09IDEsXHJcbiAgICAgICAgJ2NhbiBub3Qgc3BlY2lmeSBtaXBtYXBzIGFuZCBnZW5lcmF0ZSBtaXBtYXBzJyk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAvLyBUT0RPOiBjaGVjayBtaXAgYW5kIGZpbHRlciBtb2RlXHJcbiAgICB9XHJcblxyXG4gICAgdmFyIG1pcG1hcHMgPSBmYWNlLmltYWdlcztcclxuICAgIGZvciAodmFyIGogPSAwOyBqIDwgMTY7ICsraikge1xyXG4gICAgICB2YXIgaW1nID0gbWlwbWFwc1tqXTtcclxuICAgICAgaWYgKGltZykge1xyXG4gICAgICAgIHZhciBtdyA9IHcgPj4gajtcclxuICAgICAgICB2YXIgbWggPSBoID4+IGo7XHJcbiAgICAgICAgY2hlY2soZmFjZS5taXBtYXNrICYgKDEgPDwgaiksICdtaXNzaW5nIG1pcG1hcCBkYXRhJyk7XHJcbiAgICAgICAgY2hlY2soXHJcbiAgICAgICAgICBpbWcud2lkdGggPT09IG13ICYmXHJcbiAgICAgICAgICBpbWcuaGVpZ2h0ID09PSBtaCxcclxuICAgICAgICAgICdpbnZhbGlkIHNoYXBlIGZvciBtaXAgaW1hZ2VzJyk7XHJcbiAgICAgICAgY2hlY2soXHJcbiAgICAgICAgICBpbWcuZm9ybWF0ID09PSB0ZXh0dXJlLmZvcm1hdCAmJlxyXG4gICAgICAgICAgaW1nLmludGVybmFsZm9ybWF0ID09PSB0ZXh0dXJlLmludGVybmFsZm9ybWF0ICYmXHJcbiAgICAgICAgICBpbWcudHlwZSA9PT0gdGV4dHVyZS50eXBlLFxyXG4gICAgICAgICAgJ2luY29tcGF0aWJsZSB0eXBlIGZvciBtaXAgaW1hZ2UnKTtcclxuXHJcbiAgICAgICAgaWYgKGltZy5jb21wcmVzc2VkKSB7XHJcbiAgICAgICAgICAvLyBUT0RPOiBjaGVjayBzaXplIGZvciBjb21wcmVzc2VkIGltYWdlc1xyXG4gICAgICAgIH0gZWxzZSBpZiAoaW1nLmRhdGEpIHtcclxuICAgICAgICAgIGNoZWNrKGltZy5kYXRhLmJ5dGVMZW5ndGggPT09IG13ICogbWggKlxyXG4gICAgICAgICAgICBNYXRoLm1heChwaXhlbFNpemUoaW1nLnR5cGUsIGMpLCBpbWcudW5wYWNrQWxpZ25tZW50KSxcclxuICAgICAgICAgICAgJ2ludmFsaWQgZGF0YSBmb3IgaW1hZ2UsIGJ1ZmZlciBzaXplIGlzIGluY29uc2lzdGVudCB3aXRoIGltYWdlIGZvcm1hdCcpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoaW1nLmVsZW1lbnQpIHtcclxuICAgICAgICAgIC8vIFRPRE86IGNoZWNrIGVsZW1lbnQgY2FuIGJlIGxvYWRlZFxyXG4gICAgICAgIH0gZWxzZSBpZiAoaW1nLmNvcHkpIHtcclxuICAgICAgICAgIC8vIFRPRE86IGNoZWNrIGNvbXBhdGlibGUgZm9ybWF0IGFuZCB0eXBlXHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG52YXIgY2hlY2skMSA9IGV4dGVuZChjaGVjaywge1xyXG4gIG9wdGlvbmFsOiBjaGVja09wdGlvbmFsLFxyXG4gIHJhaXNlOiByYWlzZSxcclxuICBjb21tYW5kUmFpc2U6IGNvbW1hbmRSYWlzZSxcclxuICBjb21tYW5kOiBjaGVja0NvbW1hbmQsXHJcbiAgcGFyYW1ldGVyOiBjaGVja1BhcmFtZXRlcixcclxuICBjb21tYW5kUGFyYW1ldGVyOiBjaGVja1BhcmFtZXRlckNvbW1hbmQsXHJcbiAgY29uc3RydWN0b3I6IGNoZWNrQ29uc3RydWN0b3IsXHJcbiAgdHlwZTogY2hlY2tUeXBlT2YsXHJcbiAgY29tbWFuZFR5cGU6IGNoZWNrQ29tbWFuZFR5cGUsXHJcbiAgaXNUeXBlZEFycmF5OiBjaGVja0lzVHlwZWRBcnJheSxcclxuICBubmk6IGNoZWNrTm9uTmVnYXRpdmVJbnQsXHJcbiAgb25lT2Y6IGNoZWNrT25lT2YsXHJcbiAgc2hhZGVyRXJyb3I6IGNoZWNrU2hhZGVyRXJyb3IsXHJcbiAgbGlua0Vycm9yOiBjaGVja0xpbmtFcnJvcixcclxuICBjYWxsU2l0ZTogZ3Vlc3NDYWxsU2l0ZSxcclxuICBzYXZlQ29tbWFuZFJlZjogc2F2ZUNvbW1hbmRSZWYsXHJcbiAgc2F2ZURyYXdJbmZvOiBzYXZlRHJhd0NvbW1hbmRJbmZvLFxyXG4gIGZyYW1lYnVmZmVyRm9ybWF0OiBjaGVja0ZyYW1lYnVmZmVyRm9ybWF0LFxyXG4gIGd1ZXNzQ29tbWFuZDogZ3Vlc3NDb21tYW5kLFxyXG4gIHRleHR1cmUyRDogY2hlY2tUZXh0dXJlMkQsXHJcbiAgdGV4dHVyZUN1YmU6IGNoZWNrVGV4dHVyZUN1YmVcclxufSk7XG5cbnZhciBWQVJJQUJMRV9DT1VOVEVSID0gMDtcclxuXHJcbnZhciBEWU5fRlVOQyA9IDA7XHJcblxyXG5mdW5jdGlvbiBEeW5hbWljVmFyaWFibGUgKHR5cGUsIGRhdGEpIHtcclxuICB0aGlzLmlkID0gKFZBUklBQkxFX0NPVU5URVIrKyk7XHJcbiAgdGhpcy50eXBlID0gdHlwZTtcclxuICB0aGlzLmRhdGEgPSBkYXRhO1xyXG59XHJcblxyXG5mdW5jdGlvbiBlc2NhcGVTdHIgKHN0cikge1xyXG4gIHJldHVybiBzdHIucmVwbGFjZSgvXFxcXC9nLCAnXFxcXFxcXFwnKS5yZXBsYWNlKC9cIi9nLCAnXFxcXFwiJylcclxufVxyXG5cclxuZnVuY3Rpb24gc3BsaXRQYXJ0cyAoc3RyKSB7XHJcbiAgaWYgKHN0ci5sZW5ndGggPT09IDApIHtcclxuICAgIHJldHVybiBbXVxyXG4gIH1cclxuXHJcbiAgdmFyIGZpcnN0Q2hhciA9IHN0ci5jaGFyQXQoMCk7XHJcbiAgdmFyIGxhc3RDaGFyID0gc3RyLmNoYXJBdChzdHIubGVuZ3RoIC0gMSk7XHJcblxyXG4gIGlmIChzdHIubGVuZ3RoID4gMSAmJlxyXG4gICAgICBmaXJzdENoYXIgPT09IGxhc3RDaGFyICYmXHJcbiAgICAgIChmaXJzdENoYXIgPT09ICdcIicgfHwgZmlyc3RDaGFyID09PSBcIidcIikpIHtcclxuICAgIHJldHVybiBbJ1wiJyArIGVzY2FwZVN0cihzdHIuc3Vic3RyKDEsIHN0ci5sZW5ndGggLSAyKSkgKyAnXCInXVxyXG4gIH1cclxuXHJcbiAgdmFyIHBhcnRzID0gL1xcWyhmYWxzZXx0cnVlfG51bGx8XFxkK3wnW14nXSonfFwiW15cIl0qXCIpXFxdLy5leGVjKHN0cik7XHJcbiAgaWYgKHBhcnRzKSB7XHJcbiAgICByZXR1cm4gKFxyXG4gICAgICBzcGxpdFBhcnRzKHN0ci5zdWJzdHIoMCwgcGFydHMuaW5kZXgpKVxyXG4gICAgICAuY29uY2F0KHNwbGl0UGFydHMocGFydHNbMV0pKVxyXG4gICAgICAuY29uY2F0KHNwbGl0UGFydHMoc3RyLnN1YnN0cihwYXJ0cy5pbmRleCArIHBhcnRzWzBdLmxlbmd0aCkpKVxyXG4gICAgKVxyXG4gIH1cclxuXHJcbiAgdmFyIHN1YnBhcnRzID0gc3RyLnNwbGl0KCcuJyk7XHJcbiAgaWYgKHN1YnBhcnRzLmxlbmd0aCA9PT0gMSkge1xyXG4gICAgcmV0dXJuIFsnXCInICsgZXNjYXBlU3RyKHN0cikgKyAnXCInXVxyXG4gIH1cclxuXHJcbiAgdmFyIHJlc3VsdCA9IFtdO1xyXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3VicGFydHMubGVuZ3RoOyArK2kpIHtcclxuICAgIHJlc3VsdCA9IHJlc3VsdC5jb25jYXQoc3BsaXRQYXJ0cyhzdWJwYXJ0c1tpXSkpO1xyXG4gIH1cclxuICByZXR1cm4gcmVzdWx0XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHRvQWNjZXNzb3JTdHJpbmcgKHN0cikge1xyXG4gIHJldHVybiAnWycgKyBzcGxpdFBhcnRzKHN0cikuam9pbignXVsnKSArICddJ1xyXG59XHJcblxyXG5mdW5jdGlvbiBkZWZpbmVEeW5hbWljICh0eXBlLCBkYXRhKSB7XHJcbiAgcmV0dXJuIG5ldyBEeW5hbWljVmFyaWFibGUodHlwZSwgdG9BY2Nlc3NvclN0cmluZyhkYXRhICsgJycpKVxyXG59XHJcblxyXG5mdW5jdGlvbiBpc0R5bmFtaWMgKHgpIHtcclxuICByZXR1cm4gKHR5cGVvZiB4ID09PSAnZnVuY3Rpb24nICYmICF4Ll9yZWdsVHlwZSkgfHxcclxuICAgICAgICAgeCBpbnN0YW5jZW9mIER5bmFtaWNWYXJpYWJsZVxyXG59XHJcblxyXG5mdW5jdGlvbiB1bmJveCAoeCwgcGF0aCkge1xyXG4gIGlmICh0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgcmV0dXJuIG5ldyBEeW5hbWljVmFyaWFibGUoRFlOX0ZVTkMsIHgpXHJcbiAgfVxyXG4gIHJldHVybiB4XHJcbn1cclxuXHJcbnZhciBkeW5hbWljID0ge1xyXG4gIER5bmFtaWNWYXJpYWJsZTogRHluYW1pY1ZhcmlhYmxlLFxyXG4gIGRlZmluZTogZGVmaW5lRHluYW1pYyxcclxuICBpc0R5bmFtaWM6IGlzRHluYW1pYyxcclxuICB1bmJveDogdW5ib3gsXHJcbiAgYWNjZXNzb3I6IHRvQWNjZXNzb3JTdHJpbmdcclxufTtcblxuLyogZ2xvYmFscyByZXF1ZXN0QW5pbWF0aW9uRnJhbWUsIGNhbmNlbEFuaW1hdGlvbkZyYW1lICovXHJcbnZhciByYWYgPSB7XHJcbiAgbmV4dDogdHlwZW9mIHJlcXVlc3RBbmltYXRpb25GcmFtZSA9PT0gJ2Z1bmN0aW9uJ1xyXG4gICAgPyBmdW5jdGlvbiAoY2IpIHsgcmV0dXJuIHJlcXVlc3RBbmltYXRpb25GcmFtZShjYikgfVxyXG4gICAgOiBmdW5jdGlvbiAoY2IpIHsgcmV0dXJuIHNldFRpbWVvdXQoY2IsIDE2KSB9LFxyXG4gIGNhbmNlbDogdHlwZW9mIGNhbmNlbEFuaW1hdGlvbkZyYW1lID09PSAnZnVuY3Rpb24nXHJcbiAgICA/IGZ1bmN0aW9uIChyYWYpIHsgcmV0dXJuIGNhbmNlbEFuaW1hdGlvbkZyYW1lKHJhZikgfVxyXG4gICAgOiBjbGVhclRpbWVvdXRcclxufTtcblxuLyogZ2xvYmFscyBwZXJmb3JtYW5jZSAqL1xyXG52YXIgY2xvY2sgPSAodHlwZW9mIHBlcmZvcm1hbmNlICE9PSAndW5kZWZpbmVkJyAmJiBwZXJmb3JtYW5jZS5ub3cpXHJcbiAgPyBmdW5jdGlvbiAoKSB7IHJldHVybiBwZXJmb3JtYW5jZS5ub3coKSB9XHJcbiAgOiBmdW5jdGlvbiAoKSB7IHJldHVybiArKG5ldyBEYXRlKCkpIH07XG5cbmZ1bmN0aW9uIGNyZWF0ZVN0cmluZ1N0b3JlICgpIHtcclxuICB2YXIgc3RyaW5nSWRzID0geycnOiAwfTtcclxuICB2YXIgc3RyaW5nVmFsdWVzID0gWycnXTtcclxuICByZXR1cm4ge1xyXG4gICAgaWQ6IGZ1bmN0aW9uIChzdHIpIHtcclxuICAgICAgdmFyIHJlc3VsdCA9IHN0cmluZ0lkc1tzdHJdO1xyXG4gICAgICBpZiAocmVzdWx0KSB7XHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxyXG4gICAgICB9XHJcbiAgICAgIHJlc3VsdCA9IHN0cmluZ0lkc1tzdHJdID0gc3RyaW5nVmFsdWVzLmxlbmd0aDtcclxuICAgICAgc3RyaW5nVmFsdWVzLnB1c2goc3RyKTtcclxuICAgICAgcmV0dXJuIHJlc3VsdFxyXG4gICAgfSxcclxuXHJcbiAgICBzdHI6IGZ1bmN0aW9uIChpZCkge1xyXG4gICAgICByZXR1cm4gc3RyaW5nVmFsdWVzW2lkXVxyXG4gICAgfVxyXG4gIH1cclxufVxuXG4vLyBDb250ZXh0IGFuZCBjYW52YXMgY3JlYXRpb24gaGVscGVyIGZ1bmN0aW9uc1xyXG5mdW5jdGlvbiBjcmVhdGVDYW52YXMgKGVsZW1lbnQsIG9uRG9uZSwgcGl4ZWxSYXRpbykge1xyXG4gIHZhciBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKTtcclxuICBleHRlbmQoY2FudmFzLnN0eWxlLCB7XHJcbiAgICBib3JkZXI6IDAsXHJcbiAgICBtYXJnaW46IDAsXHJcbiAgICBwYWRkaW5nOiAwLFxyXG4gICAgdG9wOiAwLFxyXG4gICAgbGVmdDogMFxyXG4gIH0pO1xyXG4gIGVsZW1lbnQuYXBwZW5kQ2hpbGQoY2FudmFzKTtcclxuXHJcbiAgaWYgKGVsZW1lbnQgPT09IGRvY3VtZW50LmJvZHkpIHtcclxuICAgIGNhbnZhcy5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XHJcbiAgICBleHRlbmQoZWxlbWVudC5zdHlsZSwge1xyXG4gICAgICBtYXJnaW46IDAsXHJcbiAgICAgIHBhZGRpbmc6IDBcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gcmVzaXplICgpIHtcclxuICAgIHZhciB3ID0gd2luZG93LmlubmVyV2lkdGg7XHJcbiAgICB2YXIgaCA9IHdpbmRvdy5pbm5lckhlaWdodDtcclxuICAgIGlmIChlbGVtZW50ICE9PSBkb2N1bWVudC5ib2R5KSB7XHJcbiAgICAgIHZhciBib3VuZHMgPSBlbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICB3ID0gYm91bmRzLnJpZ2h0IC0gYm91bmRzLmxlZnQ7XHJcbiAgICAgIGggPSBib3VuZHMuYm90dG9tIC0gYm91bmRzLnRvcDtcclxuICAgIH1cclxuICAgIGNhbnZhcy53aWR0aCA9IHBpeGVsUmF0aW8gKiB3O1xyXG4gICAgY2FudmFzLmhlaWdodCA9IHBpeGVsUmF0aW8gKiBoO1xyXG4gICAgZXh0ZW5kKGNhbnZhcy5zdHlsZSwge1xyXG4gICAgICB3aWR0aDogdyArICdweCcsXHJcbiAgICAgIGhlaWdodDogaCArICdweCdcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHJlc2l6ZSwgZmFsc2UpO1xyXG5cclxuICBmdW5jdGlvbiBvbkRlc3Ryb3kgKCkge1xyXG4gICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHJlc2l6ZSk7XHJcbiAgICBlbGVtZW50LnJlbW92ZUNoaWxkKGNhbnZhcyk7XHJcbiAgfVxyXG5cclxuICByZXNpemUoKTtcclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIGNhbnZhczogY2FudmFzLFxyXG4gICAgb25EZXN0cm95OiBvbkRlc3Ryb3lcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZUNvbnRleHQgKGNhbnZhcywgY29udGV4dEF0dHJpYnV0ZXMpIHtcclxuICBmdW5jdGlvbiBnZXQgKG5hbWUpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIHJldHVybiBjYW52YXMuZ2V0Q29udGV4dChuYW1lLCBjb250ZXh0QXR0cmlidXRlcylcclxuICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgcmV0dXJuIG51bGxcclxuICAgIH1cclxuICB9XHJcbiAgcmV0dXJuIChcclxuICAgIGdldCgnd2ViZ2wnKSB8fFxyXG4gICAgZ2V0KCdleHBlcmltZW50YWwtd2ViZ2wnKSB8fFxyXG4gICAgZ2V0KCd3ZWJnbC1leHBlcmltZW50YWwnKVxyXG4gIClcclxufVxyXG5cclxuZnVuY3Rpb24gaXNIVE1MRWxlbWVudCAob2JqKSB7XHJcbiAgcmV0dXJuIChcclxuICAgIHR5cGVvZiBvYmoubm9kZU5hbWUgPT09ICdzdHJpbmcnICYmXHJcbiAgICB0eXBlb2Ygb2JqLmFwcGVuZENoaWxkID09PSAnZnVuY3Rpb24nICYmXHJcbiAgICB0eXBlb2Ygb2JqLmdldEJvdW5kaW5nQ2xpZW50UmVjdCA9PT0gJ2Z1bmN0aW9uJ1xyXG4gIClcclxufVxyXG5cclxuZnVuY3Rpb24gaXNXZWJHTENvbnRleHQgKG9iaikge1xyXG4gIHJldHVybiAoXHJcbiAgICB0eXBlb2Ygb2JqLmRyYXdBcnJheXMgPT09ICdmdW5jdGlvbicgfHxcclxuICAgIHR5cGVvZiBvYmouZHJhd0VsZW1lbnRzID09PSAnZnVuY3Rpb24nXHJcbiAgKVxyXG59XHJcblxyXG5mdW5jdGlvbiBwYXJzZUV4dGVuc2lvbnMgKGlucHV0KSB7XHJcbiAgaWYgKHR5cGVvZiBpbnB1dCA9PT0gJ3N0cmluZycpIHtcclxuICAgIHJldHVybiBpbnB1dC5zcGxpdCgpXHJcbiAgfVxyXG4gIGNoZWNrJDEoQXJyYXkuaXNBcnJheShpbnB1dCksICdpbnZhbGlkIGV4dGVuc2lvbiBhcnJheScpO1xyXG4gIHJldHVybiBpbnB1dFxyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRFbGVtZW50IChkZXNjKSB7XHJcbiAgaWYgKHR5cGVvZiBkZXNjID09PSAnc3RyaW5nJykge1xyXG4gICAgY2hlY2skMSh0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnLCAnbm90IHN1cHBvcnRlZCBvdXRzaWRlIG9mIERPTScpO1xyXG4gICAgcmV0dXJuIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoZGVzYylcclxuICB9XHJcbiAgcmV0dXJuIGRlc2NcclxufVxyXG5cclxuZnVuY3Rpb24gcGFyc2VBcmdzIChhcmdzXykge1xyXG4gIHZhciBhcmdzID0gYXJnc18gfHwge307XHJcbiAgdmFyIGVsZW1lbnQsIGNvbnRhaW5lciwgY2FudmFzLCBnbDtcclxuICB2YXIgY29udGV4dEF0dHJpYnV0ZXMgPSB7fTtcclxuICB2YXIgZXh0ZW5zaW9ucyA9IFtdO1xyXG4gIHZhciBvcHRpb25hbEV4dGVuc2lvbnMgPSBbXTtcclxuICB2YXIgcGl4ZWxSYXRpbyA9ICh0eXBlb2Ygd2luZG93ID09PSAndW5kZWZpbmVkJyA/IDEgOiB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbyk7XHJcbiAgdmFyIHByb2ZpbGUgPSBmYWxzZTtcclxuICB2YXIgb25Eb25lID0gZnVuY3Rpb24gKGVycikge1xyXG4gICAgaWYgKGVycikge1xyXG4gICAgICBjaGVjayQxLnJhaXNlKGVycik7XHJcbiAgICB9XHJcbiAgfTtcclxuICB2YXIgb25EZXN0cm95ID0gZnVuY3Rpb24gKCkge307XHJcbiAgaWYgKHR5cGVvZiBhcmdzID09PSAnc3RyaW5nJykge1xyXG4gICAgY2hlY2skMShcclxuICAgICAgdHlwZW9mIGRvY3VtZW50ICE9PSAndW5kZWZpbmVkJyxcclxuICAgICAgJ3NlbGVjdG9yIHF1ZXJpZXMgb25seSBzdXBwb3J0ZWQgaW4gRE9NIGVudmlyb21lbnRzJyk7XHJcbiAgICBlbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihhcmdzKTtcclxuICAgIGNoZWNrJDEoZWxlbWVudCwgJ2ludmFsaWQgcXVlcnkgc3RyaW5nIGZvciBlbGVtZW50Jyk7XHJcbiAgfSBlbHNlIGlmICh0eXBlb2YgYXJncyA9PT0gJ29iamVjdCcpIHtcclxuICAgIGlmIChpc0hUTUxFbGVtZW50KGFyZ3MpKSB7XHJcbiAgICAgIGVsZW1lbnQgPSBhcmdzO1xyXG4gICAgfSBlbHNlIGlmIChpc1dlYkdMQ29udGV4dChhcmdzKSkge1xyXG4gICAgICBnbCA9IGFyZ3M7XHJcbiAgICAgIGNhbnZhcyA9IGdsLmNhbnZhcztcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGNoZWNrJDEuY29uc3RydWN0b3IoYXJncyk7XHJcbiAgICAgIGlmICgnZ2wnIGluIGFyZ3MpIHtcclxuICAgICAgICBnbCA9IGFyZ3MuZ2w7XHJcbiAgICAgIH0gZWxzZSBpZiAoJ2NhbnZhcycgaW4gYXJncykge1xyXG4gICAgICAgIGNhbnZhcyA9IGdldEVsZW1lbnQoYXJncy5jYW52YXMpO1xyXG4gICAgICB9IGVsc2UgaWYgKCdjb250YWluZXInIGluIGFyZ3MpIHtcclxuICAgICAgICBjb250YWluZXIgPSBnZXRFbGVtZW50KGFyZ3MuY29udGFpbmVyKTtcclxuICAgICAgfVxyXG4gICAgICBpZiAoJ2F0dHJpYnV0ZXMnIGluIGFyZ3MpIHtcclxuICAgICAgICBjb250ZXh0QXR0cmlidXRlcyA9IGFyZ3MuYXR0cmlidXRlcztcclxuICAgICAgICBjaGVjayQxLnR5cGUoY29udGV4dEF0dHJpYnV0ZXMsICdvYmplY3QnLCAnaW52YWxpZCBjb250ZXh0IGF0dHJpYnV0ZXMnKTtcclxuICAgICAgfVxyXG4gICAgICBpZiAoJ2V4dGVuc2lvbnMnIGluIGFyZ3MpIHtcclxuICAgICAgICBleHRlbnNpb25zID0gcGFyc2VFeHRlbnNpb25zKGFyZ3MuZXh0ZW5zaW9ucyk7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKCdvcHRpb25hbEV4dGVuc2lvbnMnIGluIGFyZ3MpIHtcclxuICAgICAgICBvcHRpb25hbEV4dGVuc2lvbnMgPSBwYXJzZUV4dGVuc2lvbnMoYXJncy5vcHRpb25hbEV4dGVuc2lvbnMpO1xyXG4gICAgICB9XHJcbiAgICAgIGlmICgnb25Eb25lJyBpbiBhcmdzKSB7XHJcbiAgICAgICAgY2hlY2skMS50eXBlKFxyXG4gICAgICAgICAgYXJncy5vbkRvbmUsICdmdW5jdGlvbicsXHJcbiAgICAgICAgICAnaW52YWxpZCBvciBtaXNzaW5nIG9uRG9uZSBjYWxsYmFjaycpO1xyXG4gICAgICAgIG9uRG9uZSA9IGFyZ3Mub25Eb25lO1xyXG4gICAgICB9XHJcbiAgICAgIGlmICgncHJvZmlsZScgaW4gYXJncykge1xyXG4gICAgICAgIHByb2ZpbGUgPSAhIWFyZ3MucHJvZmlsZTtcclxuICAgICAgfVxyXG4gICAgICBpZiAoJ3BpeGVsUmF0aW8nIGluIGFyZ3MpIHtcclxuICAgICAgICBwaXhlbFJhdGlvID0gK2FyZ3MucGl4ZWxSYXRpbztcclxuICAgICAgICBjaGVjayQxKHBpeGVsUmF0aW8gPiAwLCAnaW52YWxpZCBwaXhlbCByYXRpbycpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfSBlbHNlIHtcclxuICAgIGNoZWNrJDEucmFpc2UoJ2ludmFsaWQgYXJndW1lbnRzIHRvIHJlZ2wnKTtcclxuICB9XHJcblxyXG4gIGlmIChlbGVtZW50KSB7XHJcbiAgICBpZiAoZWxlbWVudC5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpID09PSAnY2FudmFzJykge1xyXG4gICAgICBjYW52YXMgPSBlbGVtZW50O1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY29udGFpbmVyID0gZWxlbWVudDtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGlmICghZ2wpIHtcclxuICAgIGlmICghY2FudmFzKSB7XHJcbiAgICAgIGNoZWNrJDEoXHJcbiAgICAgICAgdHlwZW9mIGRvY3VtZW50ICE9PSAndW5kZWZpbmVkJyxcclxuICAgICAgICAnbXVzdCBtYW51YWxseSBzcGVjaWZ5IHdlYmdsIGNvbnRleHQgb3V0c2lkZSBvZiBET00gZW52aXJvbm1lbnRzJyk7XHJcbiAgICAgIHZhciByZXN1bHQgPSBjcmVhdGVDYW52YXMoY29udGFpbmVyIHx8IGRvY3VtZW50LmJvZHksIG9uRG9uZSwgcGl4ZWxSYXRpbyk7XHJcbiAgICAgIGlmICghcmVzdWx0KSB7XHJcbiAgICAgICAgcmV0dXJuIG51bGxcclxuICAgICAgfVxyXG4gICAgICBjYW52YXMgPSByZXN1bHQuY2FudmFzO1xyXG4gICAgICBvbkRlc3Ryb3kgPSByZXN1bHQub25EZXN0cm95O1xyXG4gICAgfVxyXG4gICAgZ2wgPSBjcmVhdGVDb250ZXh0KGNhbnZhcywgY29udGV4dEF0dHJpYnV0ZXMpO1xyXG4gIH1cclxuXHJcbiAgaWYgKCFnbCkge1xyXG4gICAgb25EZXN0cm95KCk7XHJcbiAgICBvbkRvbmUoJ3dlYmdsIG5vdCBzdXBwb3J0ZWQsIHRyeSB1cGdyYWRpbmcgeW91ciBicm93c2VyIG9yIGdyYXBoaWNzIGRyaXZlcnMgaHR0cDovL2dldC53ZWJnbC5vcmcnKTtcclxuICAgIHJldHVybiBudWxsXHJcbiAgfVxyXG5cclxuICByZXR1cm4ge1xyXG4gICAgZ2w6IGdsLFxyXG4gICAgY2FudmFzOiBjYW52YXMsXHJcbiAgICBjb250YWluZXI6IGNvbnRhaW5lcixcclxuICAgIGV4dGVuc2lvbnM6IGV4dGVuc2lvbnMsXHJcbiAgICBvcHRpb25hbEV4dGVuc2lvbnM6IG9wdGlvbmFsRXh0ZW5zaW9ucyxcclxuICAgIHBpeGVsUmF0aW86IHBpeGVsUmF0aW8sXHJcbiAgICBwcm9maWxlOiBwcm9maWxlLFxyXG4gICAgb25Eb25lOiBvbkRvbmUsXHJcbiAgICBvbkRlc3Ryb3k6IG9uRGVzdHJveVxyXG4gIH1cclxufVxuXG5mdW5jdGlvbiBjcmVhdGVFeHRlbnNpb25DYWNoZSAoZ2wsIGNvbmZpZykge1xyXG4gIHZhciBleHRlbnNpb25zID0ge307XHJcblxyXG4gIGZ1bmN0aW9uIHRyeUxvYWRFeHRlbnNpb24gKG5hbWVfKSB7XHJcbiAgICBjaGVjayQxLnR5cGUobmFtZV8sICdzdHJpbmcnLCAnZXh0ZW5zaW9uIG5hbWUgbXVzdCBiZSBzdHJpbmcnKTtcclxuICAgIHZhciBuYW1lID0gbmFtZV8udG9Mb3dlckNhc2UoKTtcclxuICAgIHZhciBleHQ7XHJcbiAgICB0cnkge1xyXG4gICAgICBleHQgPSBleHRlbnNpb25zW25hbWVdID0gZ2wuZ2V0RXh0ZW5zaW9uKG5hbWUpO1xyXG4gICAgfSBjYXRjaCAoZSkge31cclxuICAgIHJldHVybiAhIWV4dFxyXG4gIH1cclxuXHJcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb25maWcuZXh0ZW5zaW9ucy5sZW5ndGg7ICsraSkge1xyXG4gICAgdmFyIG5hbWUgPSBjb25maWcuZXh0ZW5zaW9uc1tpXTtcclxuICAgIGlmICghdHJ5TG9hZEV4dGVuc2lvbihuYW1lKSkge1xyXG4gICAgICBjb25maWcub25EZXN0cm95KCk7XHJcbiAgICAgIGNvbmZpZy5vbkRvbmUoJ1wiJyArIG5hbWUgKyAnXCIgZXh0ZW5zaW9uIGlzIG5vdCBzdXBwb3J0ZWQgYnkgdGhlIGN1cnJlbnQgV2ViR0wgY29udGV4dCwgdHJ5IHVwZ3JhZGluZyB5b3VyIHN5c3RlbSBvciBhIGRpZmZlcmVudCBicm93c2VyJyk7XHJcbiAgICAgIHJldHVybiBudWxsXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBjb25maWcub3B0aW9uYWxFeHRlbnNpb25zLmZvckVhY2godHJ5TG9hZEV4dGVuc2lvbik7XHJcblxyXG4gIHJldHVybiB7XHJcbiAgICBleHRlbnNpb25zOiBleHRlbnNpb25zLFxyXG4gICAgcmVzdG9yZTogZnVuY3Rpb24gKCkge1xyXG4gICAgICBPYmplY3Qua2V5cyhleHRlbnNpb25zKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XHJcbiAgICAgICAgaWYgKGV4dGVuc2lvbnNbbmFtZV0gJiYgIXRyeUxvYWRFeHRlbnNpb24obmFtZSkpIHtcclxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignKHJlZ2wpOiBlcnJvciByZXN0b3JpbmcgZXh0ZW5zaW9uICcgKyBuYW1lKVxyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgfVxyXG59XG5cbmZ1bmN0aW9uIGxvb3AgKG4sIGYpIHtcclxuICB2YXIgcmVzdWx0ID0gQXJyYXkobik7XHJcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBuOyArK2kpIHtcclxuICAgIHJlc3VsdFtpXSA9IGYoaSk7XHJcbiAgfVxyXG4gIHJldHVybiByZXN1bHRcclxufVxuXG52YXIgR0xfQllURSQxID0gNTEyMDtcclxudmFyIEdMX1VOU0lHTkVEX0JZVEUkMiA9IDUxMjE7XHJcbnZhciBHTF9TSE9SVCQxID0gNTEyMjtcclxudmFyIEdMX1VOU0lHTkVEX1NIT1JUJDEgPSA1MTIzO1xyXG52YXIgR0xfSU5UJDEgPSA1MTI0O1xyXG52YXIgR0xfVU5TSUdORURfSU5UJDEgPSA1MTI1O1xyXG52YXIgR0xfRkxPQVQkMiA9IDUxMjY7XHJcblxyXG5mdW5jdGlvbiBuZXh0UG93MTYgKHYpIHtcclxuICBmb3IgKHZhciBpID0gMTY7IGkgPD0gKDEgPDwgMjgpOyBpICo9IDE2KSB7XHJcbiAgICBpZiAodiA8PSBpKSB7XHJcbiAgICAgIHJldHVybiBpXHJcbiAgICB9XHJcbiAgfVxyXG4gIHJldHVybiAwXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGxvZzIgKHYpIHtcclxuICB2YXIgciwgc2hpZnQ7XHJcbiAgciA9ICh2ID4gMHhGRkZGKSA8PCA0O1xyXG4gIHYgPj4+PSByO1xyXG4gIHNoaWZ0ID0gKHYgPiAweEZGKSA8PCAzO1xyXG4gIHYgPj4+PSBzaGlmdDsgciB8PSBzaGlmdDtcclxuICBzaGlmdCA9ICh2ID4gMHhGKSA8PCAyO1xyXG4gIHYgPj4+PSBzaGlmdDsgciB8PSBzaGlmdDtcclxuICBzaGlmdCA9ICh2ID4gMHgzKSA8PCAxO1xyXG4gIHYgPj4+PSBzaGlmdDsgciB8PSBzaGlmdDtcclxuICByZXR1cm4gciB8ICh2ID4+IDEpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZVBvb2wgKCkge1xyXG4gIHZhciBidWZmZXJQb29sID0gbG9vcCg4LCBmdW5jdGlvbiAoKSB7XHJcbiAgICByZXR1cm4gW11cclxuICB9KTtcclxuXHJcbiAgZnVuY3Rpb24gYWxsb2MgKG4pIHtcclxuICAgIHZhciBzeiA9IG5leHRQb3cxNihuKTtcclxuICAgIHZhciBiaW4gPSBidWZmZXJQb29sW2xvZzIoc3opID4+IDJdO1xyXG4gICAgaWYgKGJpbi5sZW5ndGggPiAwKSB7XHJcbiAgICAgIHJldHVybiBiaW4ucG9wKClcclxuICAgIH1cclxuICAgIHJldHVybiBuZXcgQXJyYXlCdWZmZXIoc3opXHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBmcmVlIChidWYpIHtcclxuICAgIGJ1ZmZlclBvb2xbbG9nMihidWYuYnl0ZUxlbmd0aCkgPj4gMl0ucHVzaChidWYpO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gYWxsb2NUeXBlICh0eXBlLCBuKSB7XHJcbiAgICB2YXIgcmVzdWx0ID0gbnVsbDtcclxuICAgIHN3aXRjaCAodHlwZSkge1xyXG4gICAgICBjYXNlIEdMX0JZVEUkMTpcclxuICAgICAgICByZXN1bHQgPSBuZXcgSW50OEFycmF5KGFsbG9jKG4pLCAwLCBuKTtcclxuICAgICAgICBicmVha1xyXG4gICAgICBjYXNlIEdMX1VOU0lHTkVEX0JZVEUkMjpcclxuICAgICAgICByZXN1bHQgPSBuZXcgVWludDhBcnJheShhbGxvYyhuKSwgMCwgbik7XHJcbiAgICAgICAgYnJlYWtcclxuICAgICAgY2FzZSBHTF9TSE9SVCQxOlxyXG4gICAgICAgIHJlc3VsdCA9IG5ldyBJbnQxNkFycmF5KGFsbG9jKDIgKiBuKSwgMCwgbik7XHJcbiAgICAgICAgYnJlYWtcclxuICAgICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVCQxOlxyXG4gICAgICAgIHJlc3VsdCA9IG5ldyBVaW50MTZBcnJheShhbGxvYygyICogbiksIDAsIG4pO1xyXG4gICAgICAgIGJyZWFrXHJcbiAgICAgIGNhc2UgR0xfSU5UJDE6XHJcbiAgICAgICAgcmVzdWx0ID0gbmV3IEludDMyQXJyYXkoYWxsb2MoNCAqIG4pLCAwLCBuKTtcclxuICAgICAgICBicmVha1xyXG4gICAgICBjYXNlIEdMX1VOU0lHTkVEX0lOVCQxOlxyXG4gICAgICAgIHJlc3VsdCA9IG5ldyBVaW50MzJBcnJheShhbGxvYyg0ICogbiksIDAsIG4pO1xyXG4gICAgICAgIGJyZWFrXHJcbiAgICAgIGNhc2UgR0xfRkxPQVQkMjpcclxuICAgICAgICByZXN1bHQgPSBuZXcgRmxvYXQzMkFycmF5KGFsbG9jKDQgKiBuKSwgMCwgbik7XHJcbiAgICAgICAgYnJlYWtcclxuICAgICAgZGVmYXVsdDpcclxuICAgICAgICByZXR1cm4gbnVsbFxyXG4gICAgfVxyXG4gICAgaWYgKHJlc3VsdC5sZW5ndGggIT09IG4pIHtcclxuICAgICAgcmV0dXJuIHJlc3VsdC5zdWJhcnJheSgwLCBuKVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHJlc3VsdFxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZnJlZVR5cGUgKGFycmF5KSB7XHJcbiAgICBmcmVlKGFycmF5LmJ1ZmZlcik7XHJcbiAgfVxyXG5cclxuICByZXR1cm4ge1xyXG4gICAgYWxsb2M6IGFsbG9jLFxyXG4gICAgZnJlZTogZnJlZSxcclxuICAgIGFsbG9jVHlwZTogYWxsb2NUeXBlLFxyXG4gICAgZnJlZVR5cGU6IGZyZWVUeXBlXHJcbiAgfVxyXG59XHJcblxyXG52YXIgcG9vbCA9IGNyZWF0ZVBvb2woKTtcclxuXHJcbi8vIHplcm8gcG9vbCBmb3IgaW5pdGlhbCB6ZXJvIGRhdGFcclxucG9vbC56ZXJvID0gY3JlYXRlUG9vbCgpO1xuXG52YXIgR0xfU1VCUElYRUxfQklUUyA9IDB4MEQ1MDtcclxudmFyIEdMX1JFRF9CSVRTID0gMHgwRDUyO1xyXG52YXIgR0xfR1JFRU5fQklUUyA9IDB4MEQ1MztcclxudmFyIEdMX0JMVUVfQklUUyA9IDB4MEQ1NDtcclxudmFyIEdMX0FMUEhBX0JJVFMgPSAweDBENTU7XHJcbnZhciBHTF9ERVBUSF9CSVRTID0gMHgwRDU2O1xyXG52YXIgR0xfU1RFTkNJTF9CSVRTID0gMHgwRDU3O1xyXG5cclxudmFyIEdMX0FMSUFTRURfUE9JTlRfU0laRV9SQU5HRSA9IDB4ODQ2RDtcclxudmFyIEdMX0FMSUFTRURfTElORV9XSURUSF9SQU5HRSA9IDB4ODQ2RTtcclxuXHJcbnZhciBHTF9NQVhfVEVYVFVSRV9TSVpFID0gMHgwRDMzO1xyXG52YXIgR0xfTUFYX1ZJRVdQT1JUX0RJTVMgPSAweDBEM0E7XHJcbnZhciBHTF9NQVhfVkVSVEVYX0FUVFJJQlMgPSAweDg4Njk7XHJcbnZhciBHTF9NQVhfVkVSVEVYX1VOSUZPUk1fVkVDVE9SUyA9IDB4OERGQjtcclxudmFyIEdMX01BWF9WQVJZSU5HX1ZFQ1RPUlMgPSAweDhERkM7XHJcbnZhciBHTF9NQVhfQ09NQklORURfVEVYVFVSRV9JTUFHRV9VTklUUyA9IDB4OEI0RDtcclxudmFyIEdMX01BWF9WRVJURVhfVEVYVFVSRV9JTUFHRV9VTklUUyA9IDB4OEI0QztcclxudmFyIEdMX01BWF9URVhUVVJFX0lNQUdFX1VOSVRTID0gMHg4ODcyO1xyXG52YXIgR0xfTUFYX0ZSQUdNRU5UX1VOSUZPUk1fVkVDVE9SUyA9IDB4OERGRDtcclxudmFyIEdMX01BWF9DVUJFX01BUF9URVhUVVJFX1NJWkUgPSAweDg1MUM7XHJcbnZhciBHTF9NQVhfUkVOREVSQlVGRkVSX1NJWkUgPSAweDg0RTg7XHJcblxyXG52YXIgR0xfVkVORE9SID0gMHgxRjAwO1xyXG52YXIgR0xfUkVOREVSRVIgPSAweDFGMDE7XHJcbnZhciBHTF9WRVJTSU9OID0gMHgxRjAyO1xyXG52YXIgR0xfU0hBRElOR19MQU5HVUFHRV9WRVJTSU9OID0gMHg4QjhDO1xyXG5cclxudmFyIEdMX01BWF9URVhUVVJFX01BWF9BTklTT1RST1BZX0VYVCA9IDB4ODRGRjtcclxuXHJcbnZhciBHTF9NQVhfQ09MT1JfQVRUQUNITUVOVFNfV0VCR0wgPSAweDhDREY7XHJcbnZhciBHTF9NQVhfRFJBV19CVUZGRVJTX1dFQkdMID0gMHg4ODI0O1xyXG5cclxudmFyIEdMX1RFWFRVUkVfMkQgPSAweDBERTE7XHJcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQID0gMHg4NTEzO1xyXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YID0gMHg4NTE1O1xyXG52YXIgR0xfVEVYVFVSRTAgPSAweDg0QzA7XHJcbnZhciBHTF9SR0JBID0gMHgxOTA4O1xyXG52YXIgR0xfRkxPQVQkMSA9IDB4MTQwNjtcclxudmFyIEdMX1VOU0lHTkVEX0JZVEUkMSA9IDB4MTQwMTtcclxudmFyIEdMX0ZSQU1FQlVGRkVSID0gMHg4RDQwO1xyXG52YXIgR0xfRlJBTUVCVUZGRVJfQ09NUExFVEUgPSAweDhDRDU7XHJcbnZhciBHTF9DT0xPUl9BVFRBQ0hNRU5UMCA9IDB4OENFMDtcclxudmFyIEdMX0NPTE9SX0JVRkZFUl9CSVQkMSA9IDB4NDAwMDtcclxuXHJcbnZhciB3cmFwTGltaXRzID0gZnVuY3Rpb24gKGdsLCBleHRlbnNpb25zKSB7XHJcbiAgdmFyIG1heEFuaXNvdHJvcGljID0gMTtcclxuICBpZiAoZXh0ZW5zaW9ucy5leHRfdGV4dHVyZV9maWx0ZXJfYW5pc290cm9waWMpIHtcclxuICAgIG1heEFuaXNvdHJvcGljID0gZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9URVhUVVJFX01BWF9BTklTT1RST1BZX0VYVCk7XHJcbiAgfVxyXG5cclxuICB2YXIgbWF4RHJhd2J1ZmZlcnMgPSAxO1xyXG4gIHZhciBtYXhDb2xvckF0dGFjaG1lbnRzID0gMTtcclxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnMpIHtcclxuICAgIG1heERyYXdidWZmZXJzID0gZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9EUkFXX0JVRkZFUlNfV0VCR0wpO1xyXG4gICAgbWF4Q29sb3JBdHRhY2htZW50cyA9IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfQ09MT1JfQVRUQUNITUVOVFNfV0VCR0wpO1xyXG4gIH1cclxuXHJcbiAgLy8gZGV0ZWN0IGlmIHJlYWRpbmcgZmxvYXQgdGV4dHVyZXMgaXMgYXZhaWxhYmxlIChTYWZhcmkgZG9lc24ndCBzdXBwb3J0KVxyXG4gIHZhciByZWFkRmxvYXQgPSAhIWV4dGVuc2lvbnMub2VzX3RleHR1cmVfZmxvYXQ7XHJcbiAgaWYgKHJlYWRGbG9hdCkge1xyXG4gICAgdmFyIHJlYWRGbG9hdFRleHR1cmUgPSBnbC5jcmVhdGVUZXh0dXJlKCk7XHJcbiAgICBnbC5iaW5kVGV4dHVyZShHTF9URVhUVVJFXzJELCByZWFkRmxvYXRUZXh0dXJlKTtcclxuICAgIGdsLnRleEltYWdlMkQoR0xfVEVYVFVSRV8yRCwgMCwgR0xfUkdCQSwgMSwgMSwgMCwgR0xfUkdCQSwgR0xfRkxPQVQkMSwgbnVsbCk7XHJcblxyXG4gICAgdmFyIGZibyA9IGdsLmNyZWF0ZUZyYW1lYnVmZmVyKCk7XHJcbiAgICBnbC5iaW5kRnJhbWVidWZmZXIoR0xfRlJBTUVCVUZGRVIsIGZibyk7XHJcbiAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChHTF9GUkFNRUJVRkZFUiwgR0xfQ09MT1JfQVRUQUNITUVOVDAsIEdMX1RFWFRVUkVfMkQsIHJlYWRGbG9hdFRleHR1cmUsIDApO1xyXG4gICAgZ2wuYmluZFRleHR1cmUoR0xfVEVYVFVSRV8yRCwgbnVsbCk7XHJcblxyXG4gICAgaWYgKGdsLmNoZWNrRnJhbWVidWZmZXJTdGF0dXMoR0xfRlJBTUVCVUZGRVIpICE9PSBHTF9GUkFNRUJVRkZFUl9DT01QTEVURSkgcmVhZEZsb2F0ID0gZmFsc2U7XHJcblxyXG4gICAgZWxzZSB7XHJcbiAgICAgIGdsLnZpZXdwb3J0KDAsIDAsIDEsIDEpO1xyXG4gICAgICBnbC5jbGVhckNvbG9yKDEuMCwgMC4wLCAwLjAsIDEuMCk7XHJcbiAgICAgIGdsLmNsZWFyKEdMX0NPTE9SX0JVRkZFUl9CSVQkMSk7XHJcbiAgICAgIHZhciBwaXhlbHMgPSBwb29sLmFsbG9jVHlwZShHTF9GTE9BVCQxLCA0KTtcclxuICAgICAgZ2wucmVhZFBpeGVscygwLCAwLCAxLCAxLCBHTF9SR0JBLCBHTF9GTE9BVCQxLCBwaXhlbHMpO1xyXG5cclxuICAgICAgaWYgKGdsLmdldEVycm9yKCkpIHJlYWRGbG9hdCA9IGZhbHNlO1xyXG4gICAgICBlbHNlIHtcclxuICAgICAgICBnbC5kZWxldGVGcmFtZWJ1ZmZlcihmYm8pO1xyXG4gICAgICAgIGdsLmRlbGV0ZVRleHR1cmUocmVhZEZsb2F0VGV4dHVyZSk7XHJcblxyXG4gICAgICAgIHJlYWRGbG9hdCA9IHBpeGVsc1swXSA9PT0gMS4wO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBwb29sLmZyZWVUeXBlKHBpeGVscyk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvLyBkZXRlY3Qgbm9uIHBvd2VyIG9mIHR3byBjdWJlIHRleHR1cmVzIHN1cHBvcnQgKElFIGRvZXNuJ3Qgc3VwcG9ydClcclxuICB2YXIgaXNJRSA9IHR5cGVvZiBuYXZpZ2F0b3IgIT09ICd1bmRlZmluZWQnICYmICgvTVNJRS8udGVzdChuYXZpZ2F0b3IudXNlckFnZW50KSB8fCAvVHJpZGVudFxcLy8udGVzdChuYXZpZ2F0b3IuYXBwVmVyc2lvbikgfHwgL0VkZ2UvLnRlc3QobmF2aWdhdG9yLnVzZXJBZ2VudCkpO1xyXG5cclxuICB2YXIgbnBvdFRleHR1cmVDdWJlID0gdHJ1ZTtcclxuXHJcbiAgaWYgKCFpc0lFKSB7XHJcbiAgICB2YXIgY3ViZVRleHR1cmUgPSBnbC5jcmVhdGVUZXh0dXJlKCk7XHJcbiAgICB2YXIgZGF0YSA9IHBvb2wuYWxsb2NUeXBlKEdMX1VOU0lHTkVEX0JZVEUkMSwgMzYpO1xyXG4gICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCk7XHJcbiAgICBnbC5iaW5kVGV4dHVyZShHTF9URVhUVVJFX0NVQkVfTUFQLCBjdWJlVGV4dHVyZSk7XHJcbiAgICBnbC50ZXhJbWFnZTJEKEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCwgMCwgR0xfUkdCQSwgMywgMywgMCwgR0xfUkdCQSwgR0xfVU5TSUdORURfQllURSQxLCBkYXRhKTtcclxuICAgIHBvb2wuZnJlZVR5cGUoZGF0YSk7XHJcbiAgICBnbC5iaW5kVGV4dHVyZShHTF9URVhUVVJFX0NVQkVfTUFQLCBudWxsKTtcclxuICAgIGdsLmRlbGV0ZVRleHR1cmUoY3ViZVRleHR1cmUpO1xyXG4gICAgbnBvdFRleHR1cmVDdWJlID0gIWdsLmdldEVycm9yKCk7XHJcbiAgfVxyXG5cclxuICByZXR1cm4ge1xyXG4gICAgLy8gZHJhd2luZyBidWZmZXIgYml0IGRlcHRoXHJcbiAgICBjb2xvckJpdHM6IFtcclxuICAgICAgZ2wuZ2V0UGFyYW1ldGVyKEdMX1JFRF9CSVRTKSxcclxuICAgICAgZ2wuZ2V0UGFyYW1ldGVyKEdMX0dSRUVOX0JJVFMpLFxyXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfQkxVRV9CSVRTKSxcclxuICAgICAgZ2wuZ2V0UGFyYW1ldGVyKEdMX0FMUEhBX0JJVFMpXHJcbiAgICBdLFxyXG4gICAgZGVwdGhCaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfREVQVEhfQklUUyksXHJcbiAgICBzdGVuY2lsQml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX1NURU5DSUxfQklUUyksXHJcbiAgICBzdWJwaXhlbEJpdHM6IGdsLmdldFBhcmFtZXRlcihHTF9TVUJQSVhFTF9CSVRTKSxcclxuXHJcbiAgICAvLyBzdXBwb3J0ZWQgZXh0ZW5zaW9uc1xyXG4gICAgZXh0ZW5zaW9uczogT2JqZWN0LmtleXMoZXh0ZW5zaW9ucykuZmlsdGVyKGZ1bmN0aW9uIChleHQpIHtcclxuICAgICAgcmV0dXJuICEhZXh0ZW5zaW9uc1tleHRdXHJcbiAgICB9KSxcclxuXHJcbiAgICAvLyBtYXggYW5pc28gc2FtcGxlc1xyXG4gICAgbWF4QW5pc290cm9waWM6IG1heEFuaXNvdHJvcGljLFxyXG5cclxuICAgIC8vIG1heCBkcmF3IGJ1ZmZlcnNcclxuICAgIG1heERyYXdidWZmZXJzOiBtYXhEcmF3YnVmZmVycyxcclxuICAgIG1heENvbG9yQXR0YWNobWVudHM6IG1heENvbG9yQXR0YWNobWVudHMsXHJcblxyXG4gICAgLy8gcG9pbnQgYW5kIGxpbmUgc2l6ZSByYW5nZXNcclxuICAgIHBvaW50U2l6ZURpbXM6IGdsLmdldFBhcmFtZXRlcihHTF9BTElBU0VEX1BPSU5UX1NJWkVfUkFOR0UpLFxyXG4gICAgbGluZVdpZHRoRGltczogZ2wuZ2V0UGFyYW1ldGVyKEdMX0FMSUFTRURfTElORV9XSURUSF9SQU5HRSksXHJcbiAgICBtYXhWaWV3cG9ydERpbXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVklFV1BPUlRfRElNUyksXHJcbiAgICBtYXhDb21iaW5lZFRleHR1cmVVbml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9DT01CSU5FRF9URVhUVVJFX0lNQUdFX1VOSVRTKSxcclxuICAgIG1heEN1YmVNYXBTaXplOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NVQkVfTUFQX1RFWFRVUkVfU0laRSksXHJcbiAgICBtYXhSZW5kZXJidWZmZXJTaXplOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1JFTkRFUkJVRkZFUl9TSVpFKSxcclxuICAgIG1heFRleHR1cmVVbml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9URVhUVVJFX0lNQUdFX1VOSVRTKSxcclxuICAgIG1heFRleHR1cmVTaXplOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1RFWFRVUkVfU0laRSksXHJcbiAgICBtYXhBdHRyaWJ1dGVzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZFUlRFWF9BVFRSSUJTKSxcclxuICAgIG1heFZlcnRleFVuaWZvcm1zOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZFUlRFWF9VTklGT1JNX1ZFQ1RPUlMpLFxyXG4gICAgbWF4VmVydGV4VGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZFUlRFWF9URVhUVVJFX0lNQUdFX1VOSVRTKSxcclxuICAgIG1heFZhcnlpbmdWZWN0b3JzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1ZBUllJTkdfVkVDVE9SUyksXHJcbiAgICBtYXhGcmFnbWVudFVuaWZvcm1zOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0ZSQUdNRU5UX1VOSUZPUk1fVkVDVE9SUyksXHJcblxyXG4gICAgLy8gdmVuZG9yIGluZm9cclxuICAgIGdsc2w6IGdsLmdldFBhcmFtZXRlcihHTF9TSEFESU5HX0xBTkdVQUdFX1ZFUlNJT04pLFxyXG4gICAgcmVuZGVyZXI6IGdsLmdldFBhcmFtZXRlcihHTF9SRU5ERVJFUiksXHJcbiAgICB2ZW5kb3I6IGdsLmdldFBhcmFtZXRlcihHTF9WRU5ET1IpLFxyXG4gICAgdmVyc2lvbjogZ2wuZ2V0UGFyYW1ldGVyKEdMX1ZFUlNJT04pLFxyXG5cclxuICAgIC8vIHF1aXJrc1xyXG4gICAgcmVhZEZsb2F0OiByZWFkRmxvYXQsXHJcbiAgICBucG90VGV4dHVyZUN1YmU6IG5wb3RUZXh0dXJlQ3ViZVxyXG4gIH1cclxufTtcblxuZnVuY3Rpb24gaXNOREFycmF5TGlrZSAob2JqKSB7XHJcbiAgcmV0dXJuIChcclxuICAgICEhb2JqICYmXHJcbiAgICB0eXBlb2Ygb2JqID09PSAnb2JqZWN0JyAmJlxyXG4gICAgQXJyYXkuaXNBcnJheShvYmouc2hhcGUpICYmXHJcbiAgICBBcnJheS5pc0FycmF5KG9iai5zdHJpZGUpICYmXHJcbiAgICB0eXBlb2Ygb2JqLm9mZnNldCA9PT0gJ251bWJlcicgJiZcclxuICAgIG9iai5zaGFwZS5sZW5ndGggPT09IG9iai5zdHJpZGUubGVuZ3RoICYmXHJcbiAgICAoQXJyYXkuaXNBcnJheShvYmouZGF0YSkgfHxcclxuICAgICAgaXNUeXBlZEFycmF5KG9iai5kYXRhKSkpXHJcbn1cblxudmFyIHZhbHVlcyA9IGZ1bmN0aW9uIChvYmopIHtcclxuICByZXR1cm4gT2JqZWN0LmtleXMob2JqKS5tYXAoZnVuY3Rpb24gKGtleSkgeyByZXR1cm4gb2JqW2tleV0gfSlcclxufTtcblxudmFyIGZsYXR0ZW5VdGlscyA9IHtcclxuICBzaGFwZTogYXJyYXlTaGFwZSQxLFxyXG4gIGZsYXR0ZW46IGZsYXR0ZW5BcnJheVxyXG59O1xyXG5cclxuZnVuY3Rpb24gZmxhdHRlbjFEIChhcnJheSwgbngsIG91dCkge1xyXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbng7ICsraSkge1xyXG4gICAgb3V0W2ldID0gYXJyYXlbaV07XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBmbGF0dGVuMkQgKGFycmF5LCBueCwgbnksIG91dCkge1xyXG4gIHZhciBwdHIgPSAwO1xyXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbng7ICsraSkge1xyXG4gICAgdmFyIHJvdyA9IGFycmF5W2ldO1xyXG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBueTsgKytqKSB7XHJcbiAgICAgIG91dFtwdHIrK10gPSByb3dbal07XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBmbGF0dGVuM0QgKGFycmF5LCBueCwgbnksIG56LCBvdXQsIHB0cl8pIHtcclxuICB2YXIgcHRyID0gcHRyXztcclxuICBmb3IgKHZhciBpID0gMDsgaSA8IG54OyArK2kpIHtcclxuICAgIHZhciByb3cgPSBhcnJheVtpXTtcclxuICAgIGZvciAodmFyIGogPSAwOyBqIDwgbnk7ICsraikge1xyXG4gICAgICB2YXIgY29sID0gcm93W2pdO1xyXG4gICAgICBmb3IgKHZhciBrID0gMDsgayA8IG56OyArK2spIHtcclxuICAgICAgICBvdXRbcHRyKytdID0gY29sW2tdO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBmbGF0dGVuUmVjIChhcnJheSwgc2hhcGUsIGxldmVsLCBvdXQsIHB0cikge1xyXG4gIHZhciBzdHJpZGUgPSAxO1xyXG4gIGZvciAodmFyIGkgPSBsZXZlbCArIDE7IGkgPCBzaGFwZS5sZW5ndGg7ICsraSkge1xyXG4gICAgc3RyaWRlICo9IHNoYXBlW2ldO1xyXG4gIH1cclxuICB2YXIgbiA9IHNoYXBlW2xldmVsXTtcclxuICBpZiAoc2hhcGUubGVuZ3RoIC0gbGV2ZWwgPT09IDQpIHtcclxuICAgIHZhciBueCA9IHNoYXBlW2xldmVsICsgMV07XHJcbiAgICB2YXIgbnkgPSBzaGFwZVtsZXZlbCArIDJdO1xyXG4gICAgdmFyIG56ID0gc2hhcGVbbGV2ZWwgKyAzXTtcclxuICAgIGZvciAoaSA9IDA7IGkgPCBuOyArK2kpIHtcclxuICAgICAgZmxhdHRlbjNEKGFycmF5W2ldLCBueCwgbnksIG56LCBvdXQsIHB0cik7XHJcbiAgICAgIHB0ciArPSBzdHJpZGU7XHJcbiAgICB9XHJcbiAgfSBlbHNlIHtcclxuICAgIGZvciAoaSA9IDA7IGkgPCBuOyArK2kpIHtcclxuICAgICAgZmxhdHRlblJlYyhhcnJheVtpXSwgc2hhcGUsIGxldmVsICsgMSwgb3V0LCBwdHIpO1xyXG4gICAgICBwdHIgKz0gc3RyaWRlO1xyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZmxhdHRlbkFycmF5IChhcnJheSwgc2hhcGUsIHR5cGUsIG91dF8pIHtcclxuICB2YXIgc3ogPSAxO1xyXG4gIGlmIChzaGFwZS5sZW5ndGgpIHtcclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2hhcGUubGVuZ3RoOyArK2kpIHtcclxuICAgICAgc3ogKj0gc2hhcGVbaV07XHJcbiAgICB9XHJcbiAgfSBlbHNlIHtcclxuICAgIHN6ID0gMDtcclxuICB9XHJcbiAgdmFyIG91dCA9IG91dF8gfHwgcG9vbC5hbGxvY1R5cGUodHlwZSwgc3opO1xyXG4gIHN3aXRjaCAoc2hhcGUubGVuZ3RoKSB7XHJcbiAgICBjYXNlIDA6XHJcbiAgICAgIGJyZWFrXHJcbiAgICBjYXNlIDE6XHJcbiAgICAgIGZsYXR0ZW4xRChhcnJheSwgc2hhcGVbMF0sIG91dCk7XHJcbiAgICAgIGJyZWFrXHJcbiAgICBjYXNlIDI6XHJcbiAgICAgIGZsYXR0ZW4yRChhcnJheSwgc2hhcGVbMF0sIHNoYXBlWzFdLCBvdXQpO1xyXG4gICAgICBicmVha1xyXG4gICAgY2FzZSAzOlxyXG4gICAgICBmbGF0dGVuM0QoYXJyYXksIHNoYXBlWzBdLCBzaGFwZVsxXSwgc2hhcGVbMl0sIG91dCwgMCk7XHJcbiAgICAgIGJyZWFrXHJcbiAgICBkZWZhdWx0OlxyXG4gICAgICBmbGF0dGVuUmVjKGFycmF5LCBzaGFwZSwgMCwgb3V0LCAwKTtcclxuICB9XHJcbiAgcmV0dXJuIG91dFxyXG59XHJcblxyXG5mdW5jdGlvbiBhcnJheVNoYXBlJDEgKGFycmF5Xykge1xyXG4gIHZhciBzaGFwZSA9IFtdO1xyXG4gIGZvciAodmFyIGFycmF5ID0gYXJyYXlfOyBhcnJheS5sZW5ndGg7IGFycmF5ID0gYXJyYXlbMF0pIHtcclxuICAgIHNoYXBlLnB1c2goYXJyYXkubGVuZ3RoKTtcclxuICB9XHJcbiAgcmV0dXJuIHNoYXBlXHJcbn1cblxudmFyIGFycmF5VHlwZXMgPSB7XG5cdFwiW29iamVjdCBJbnQ4QXJyYXldXCI6IDUxMjAsXG5cdFwiW29iamVjdCBJbnQxNkFycmF5XVwiOiA1MTIyLFxuXHRcIltvYmplY3QgSW50MzJBcnJheV1cIjogNTEyNCxcblx0XCJbb2JqZWN0IFVpbnQ4QXJyYXldXCI6IDUxMjEsXG5cdFwiW29iamVjdCBVaW50OENsYW1wZWRBcnJheV1cIjogNTEyMSxcblx0XCJbb2JqZWN0IFVpbnQxNkFycmF5XVwiOiA1MTIzLFxuXHRcIltvYmplY3QgVWludDMyQXJyYXldXCI6IDUxMjUsXG5cdFwiW29iamVjdCBGbG9hdDMyQXJyYXldXCI6IDUxMjYsXG5cdFwiW29iamVjdCBGbG9hdDY0QXJyYXldXCI6IDUxMjEsXG5cdFwiW29iamVjdCBBcnJheUJ1ZmZlcl1cIjogNTEyMVxufTtcblxudmFyIGludDggPSA1MTIwO1xudmFyIGludDE2ID0gNTEyMjtcbnZhciBpbnQzMiA9IDUxMjQ7XG52YXIgdWludDggPSA1MTIxO1xudmFyIHVpbnQxNiA9IDUxMjM7XG52YXIgdWludDMyID0gNTEyNTtcbnZhciBmbG9hdCA9IDUxMjY7XG52YXIgZmxvYXQzMiA9IDUxMjY7XG52YXIgZ2xUeXBlcyA9IHtcblx0aW50ODogaW50OCxcblx0aW50MTY6IGludDE2LFxuXHRpbnQzMjogaW50MzIsXG5cdHVpbnQ4OiB1aW50OCxcblx0dWludDE2OiB1aW50MTYsXG5cdHVpbnQzMjogdWludDMyLFxuXHRmbG9hdDogZmxvYXQsXG5cdGZsb2F0MzI6IGZsb2F0MzJcbn07XG5cbnZhciBkeW5hbWljJDEgPSAzNTA0ODtcbnZhciBzdHJlYW0gPSAzNTA0MDtcbnZhciB1c2FnZVR5cGVzID0ge1xuXHRkeW5hbWljOiBkeW5hbWljJDEsXG5cdHN0cmVhbTogc3RyZWFtLFxuXHRcInN0YXRpY1wiOiAzNTA0NFxufTtcblxudmFyIGFycmF5RmxhdHRlbiA9IGZsYXR0ZW5VdGlscy5mbGF0dGVuO1xyXG52YXIgYXJyYXlTaGFwZSA9IGZsYXR0ZW5VdGlscy5zaGFwZTtcclxuXHJcbnZhciBHTF9TVEFUSUNfRFJBVyA9IDB4ODhFNDtcclxudmFyIEdMX1NUUkVBTV9EUkFXID0gMHg4OEUwO1xyXG5cclxudmFyIEdMX1VOU0lHTkVEX0JZVEUkMyA9IDUxMjE7XHJcbnZhciBHTF9GTE9BVCQzID0gNTEyNjtcclxuXHJcbnZhciBEVFlQRVNfU0laRVMgPSBbXTtcclxuRFRZUEVTX1NJWkVTWzUxMjBdID0gMTsgLy8gaW50OFxyXG5EVFlQRVNfU0laRVNbNTEyMl0gPSAyOyAvLyBpbnQxNlxyXG5EVFlQRVNfU0laRVNbNTEyNF0gPSA0OyAvLyBpbnQzMlxyXG5EVFlQRVNfU0laRVNbNTEyMV0gPSAxOyAvLyB1aW50OFxyXG5EVFlQRVNfU0laRVNbNTEyM10gPSAyOyAvLyB1aW50MTZcclxuRFRZUEVTX1NJWkVTWzUxMjVdID0gNDsgLy8gdWludDMyXHJcbkRUWVBFU19TSVpFU1s1MTI2XSA9IDQ7IC8vIGZsb2F0MzJcclxuXHJcbmZ1bmN0aW9uIHR5cGVkQXJyYXlDb2RlIChkYXRhKSB7XHJcbiAgcmV0dXJuIGFycmF5VHlwZXNbT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGRhdGEpXSB8IDBcclxufVxyXG5cclxuZnVuY3Rpb24gY29weUFycmF5IChvdXQsIGlucCkge1xyXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgaW5wLmxlbmd0aDsgKytpKSB7XHJcbiAgICBvdXRbaV0gPSBpbnBbaV07XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiB0cmFuc3Bvc2UgKFxyXG4gIHJlc3VsdCwgZGF0YSwgc2hhcGVYLCBzaGFwZVksIHN0cmlkZVgsIHN0cmlkZVksIG9mZnNldCkge1xyXG4gIHZhciBwdHIgPSAwO1xyXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc2hhcGVYOyArK2kpIHtcclxuICAgIGZvciAodmFyIGogPSAwOyBqIDwgc2hhcGVZOyArK2opIHtcclxuICAgICAgcmVzdWx0W3B0cisrXSA9IGRhdGFbc3RyaWRlWCAqIGkgKyBzdHJpZGVZICogaiArIG9mZnNldF07XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiB3cmFwQnVmZmVyU3RhdGUgKGdsLCBzdGF0cywgY29uZmlnLCBhdHRyaWJ1dGVTdGF0ZSkge1xyXG4gIHZhciBidWZmZXJDb3VudCA9IDA7XHJcbiAgdmFyIGJ1ZmZlclNldCA9IHt9O1xyXG5cclxuICBmdW5jdGlvbiBSRUdMQnVmZmVyICh0eXBlKSB7XHJcbiAgICB0aGlzLmlkID0gYnVmZmVyQ291bnQrKztcclxuICAgIHRoaXMuYnVmZmVyID0gZ2wuY3JlYXRlQnVmZmVyKCk7XHJcbiAgICB0aGlzLnR5cGUgPSB0eXBlO1xyXG4gICAgdGhpcy51c2FnZSA9IEdMX1NUQVRJQ19EUkFXO1xyXG4gICAgdGhpcy5ieXRlTGVuZ3RoID0gMDtcclxuICAgIHRoaXMuZGltZW5zaW9uID0gMTtcclxuICAgIHRoaXMuZHR5cGUgPSBHTF9VTlNJR05FRF9CWVRFJDM7XHJcblxyXG4gICAgdGhpcy5wZXJzaXN0ZW50RGF0YSA9IG51bGw7XHJcblxyXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XHJcbiAgICAgIHRoaXMuc3RhdHMgPSB7c2l6ZTogMH07XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBSRUdMQnVmZmVyLnByb3RvdHlwZS5iaW5kID0gZnVuY3Rpb24gKCkge1xyXG4gICAgZ2wuYmluZEJ1ZmZlcih0aGlzLnR5cGUsIHRoaXMuYnVmZmVyKTtcclxuICB9O1xyXG5cclxuICBSRUdMQnVmZmVyLnByb3RvdHlwZS5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xyXG4gICAgZGVzdHJveSh0aGlzKTtcclxuICB9O1xyXG5cclxuICB2YXIgc3RyZWFtUG9vbCA9IFtdO1xyXG5cclxuICBmdW5jdGlvbiBjcmVhdGVTdHJlYW0gKHR5cGUsIGRhdGEpIHtcclxuICAgIHZhciBidWZmZXIgPSBzdHJlYW1Qb29sLnBvcCgpO1xyXG4gICAgaWYgKCFidWZmZXIpIHtcclxuICAgICAgYnVmZmVyID0gbmV3IFJFR0xCdWZmZXIodHlwZSk7XHJcbiAgICB9XHJcbiAgICBidWZmZXIuYmluZCgpO1xyXG4gICAgaW5pdEJ1ZmZlckZyb21EYXRhKGJ1ZmZlciwgZGF0YSwgR0xfU1RSRUFNX0RSQVcsIDAsIDEsIGZhbHNlKTtcclxuICAgIHJldHVybiBidWZmZXJcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGRlc3Ryb3lTdHJlYW0gKHN0cmVhbSQkMSkge1xyXG4gICAgc3RyZWFtUG9vbC5wdXNoKHN0cmVhbSQkMSk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBpbml0QnVmZmVyRnJvbVR5cGVkQXJyYXkgKGJ1ZmZlciwgZGF0YSwgdXNhZ2UpIHtcclxuICAgIGJ1ZmZlci5ieXRlTGVuZ3RoID0gZGF0YS5ieXRlTGVuZ3RoO1xyXG4gICAgZ2wuYnVmZmVyRGF0YShidWZmZXIudHlwZSwgZGF0YSwgdXNhZ2UpO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gaW5pdEJ1ZmZlckZyb21EYXRhIChidWZmZXIsIGRhdGEsIHVzYWdlLCBkdHlwZSwgZGltZW5zaW9uLCBwZXJzaXN0KSB7XHJcbiAgICB2YXIgc2hhcGU7XHJcbiAgICBidWZmZXIudXNhZ2UgPSB1c2FnZTtcclxuICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XHJcbiAgICAgIGJ1ZmZlci5kdHlwZSA9IGR0eXBlIHx8IEdMX0ZMT0FUJDM7XHJcbiAgICAgIGlmIChkYXRhLmxlbmd0aCA+IDApIHtcclxuICAgICAgICB2YXIgZmxhdERhdGE7XHJcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YVswXSkpIHtcclxuICAgICAgICAgIHNoYXBlID0gYXJyYXlTaGFwZShkYXRhKTtcclxuICAgICAgICAgIHZhciBkaW0gPSAxO1xyXG4gICAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCBzaGFwZS5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgICAgICBkaW0gKj0gc2hhcGVbaV07XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBidWZmZXIuZGltZW5zaW9uID0gZGltO1xyXG4gICAgICAgICAgZmxhdERhdGEgPSBhcnJheUZsYXR0ZW4oZGF0YSwgc2hhcGUsIGJ1ZmZlci5kdHlwZSk7XHJcbiAgICAgICAgICBpbml0QnVmZmVyRnJvbVR5cGVkQXJyYXkoYnVmZmVyLCBmbGF0RGF0YSwgdXNhZ2UpO1xyXG4gICAgICAgICAgaWYgKHBlcnNpc3QpIHtcclxuICAgICAgICAgICAgYnVmZmVyLnBlcnNpc3RlbnREYXRhID0gZmxhdERhdGE7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBwb29sLmZyZWVUeXBlKGZsYXREYXRhKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBkYXRhWzBdID09PSAnbnVtYmVyJykge1xyXG4gICAgICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IGRpbWVuc2lvbjtcclxuICAgICAgICAgIHZhciB0eXBlZERhdGEgPSBwb29sLmFsbG9jVHlwZShidWZmZXIuZHR5cGUsIGRhdGEubGVuZ3RoKTtcclxuICAgICAgICAgIGNvcHlBcnJheSh0eXBlZERhdGEsIGRhdGEpO1xyXG4gICAgICAgICAgaW5pdEJ1ZmZlckZyb21UeXBlZEFycmF5KGJ1ZmZlciwgdHlwZWREYXRhLCB1c2FnZSk7XHJcbiAgICAgICAgICBpZiAocGVyc2lzdCkge1xyXG4gICAgICAgICAgICBidWZmZXIucGVyc2lzdGVudERhdGEgPSB0eXBlZERhdGE7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBwb29sLmZyZWVUeXBlKHR5cGVkRGF0YSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIGlmIChpc1R5cGVkQXJyYXkoZGF0YVswXSkpIHtcclxuICAgICAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBkYXRhWzBdLmxlbmd0aDtcclxuICAgICAgICAgIGJ1ZmZlci5kdHlwZSA9IGR0eXBlIHx8IHR5cGVkQXJyYXlDb2RlKGRhdGFbMF0pIHx8IEdMX0ZMT0FUJDM7XHJcbiAgICAgICAgICBmbGF0RGF0YSA9IGFycmF5RmxhdHRlbihcclxuICAgICAgICAgICAgZGF0YSxcclxuICAgICAgICAgICAgW2RhdGEubGVuZ3RoLCBkYXRhWzBdLmxlbmd0aF0sXHJcbiAgICAgICAgICAgIGJ1ZmZlci5kdHlwZSk7XHJcbiAgICAgICAgICBpbml0QnVmZmVyRnJvbVR5cGVkQXJyYXkoYnVmZmVyLCBmbGF0RGF0YSwgdXNhZ2UpO1xyXG4gICAgICAgICAgaWYgKHBlcnNpc3QpIHtcclxuICAgICAgICAgICAgYnVmZmVyLnBlcnNpc3RlbnREYXRhID0gZmxhdERhdGE7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBwb29sLmZyZWVUeXBlKGZsYXREYXRhKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgY2hlY2skMS5yYWlzZSgnaW52YWxpZCBidWZmZXIgZGF0YScpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfSBlbHNlIGlmIChpc1R5cGVkQXJyYXkoZGF0YSkpIHtcclxuICAgICAgYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgdHlwZWRBcnJheUNvZGUoZGF0YSk7XHJcbiAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBkaW1lbnNpb247XHJcbiAgICAgIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheShidWZmZXIsIGRhdGEsIHVzYWdlKTtcclxuICAgICAgaWYgKHBlcnNpc3QpIHtcclxuICAgICAgICBidWZmZXIucGVyc2lzdGVudERhdGEgPSBuZXcgVWludDhBcnJheShuZXcgVWludDhBcnJheShkYXRhLmJ1ZmZlcikpO1xyXG4gICAgICB9XHJcbiAgICB9IGVsc2UgaWYgKGlzTkRBcnJheUxpa2UoZGF0YSkpIHtcclxuICAgICAgc2hhcGUgPSBkYXRhLnNoYXBlO1xyXG4gICAgICB2YXIgc3RyaWRlID0gZGF0YS5zdHJpZGU7XHJcbiAgICAgIHZhciBvZmZzZXQgPSBkYXRhLm9mZnNldDtcclxuXHJcbiAgICAgIHZhciBzaGFwZVggPSAwO1xyXG4gICAgICB2YXIgc2hhcGVZID0gMDtcclxuICAgICAgdmFyIHN0cmlkZVggPSAwO1xyXG4gICAgICB2YXIgc3RyaWRlWSA9IDA7XHJcbiAgICAgIGlmIChzaGFwZS5sZW5ndGggPT09IDEpIHtcclxuICAgICAgICBzaGFwZVggPSBzaGFwZVswXTtcclxuICAgICAgICBzaGFwZVkgPSAxO1xyXG4gICAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF07XHJcbiAgICAgICAgc3RyaWRlWSA9IDA7XHJcbiAgICAgIH0gZWxzZSBpZiAoc2hhcGUubGVuZ3RoID09PSAyKSB7XHJcbiAgICAgICAgc2hhcGVYID0gc2hhcGVbMF07XHJcbiAgICAgICAgc2hhcGVZID0gc2hhcGVbMV07XHJcbiAgICAgICAgc3RyaWRlWCA9IHN0cmlkZVswXTtcclxuICAgICAgICBzdHJpZGVZID0gc3RyaWRlWzFdO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNoZWNrJDEucmFpc2UoJ2ludmFsaWQgc2hhcGUnKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgdHlwZWRBcnJheUNvZGUoZGF0YS5kYXRhKSB8fCBHTF9GTE9BVCQzO1xyXG4gICAgICBidWZmZXIuZGltZW5zaW9uID0gc2hhcGVZO1xyXG5cclxuICAgICAgdmFyIHRyYW5zcG9zZURhdGEgPSBwb29sLmFsbG9jVHlwZShidWZmZXIuZHR5cGUsIHNoYXBlWCAqIHNoYXBlWSk7XHJcbiAgICAgIHRyYW5zcG9zZSh0cmFuc3Bvc2VEYXRhLFxyXG4gICAgICAgIGRhdGEuZGF0YSxcclxuICAgICAgICBzaGFwZVgsIHNoYXBlWSxcclxuICAgICAgICBzdHJpZGVYLCBzdHJpZGVZLFxyXG4gICAgICAgIG9mZnNldCk7XHJcbiAgICAgIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheShidWZmZXIsIHRyYW5zcG9zZURhdGEsIHVzYWdlKTtcclxuICAgICAgaWYgKHBlcnNpc3QpIHtcclxuICAgICAgICBidWZmZXIucGVyc2lzdGVudERhdGEgPSB0cmFuc3Bvc2VEYXRhO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHBvb2wuZnJlZVR5cGUodHJhbnNwb3NlRGF0YSk7XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGNoZWNrJDEucmFpc2UoJ2ludmFsaWQgYnVmZmVyIGRhdGEnKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKGJ1ZmZlcikge1xyXG4gICAgc3RhdHMuYnVmZmVyQ291bnQtLTtcclxuXHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGF0dHJpYnV0ZVN0YXRlLnN0YXRlLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgIHZhciByZWNvcmQgPSBhdHRyaWJ1dGVTdGF0ZS5zdGF0ZVtpXTtcclxuICAgICAgaWYgKHJlY29yZC5idWZmZXIgPT09IGJ1ZmZlcikge1xyXG4gICAgICAgIGdsLmRpc2FibGVWZXJ0ZXhBdHRyaWJBcnJheShpKTtcclxuICAgICAgICByZWNvcmQuYnVmZmVyID0gbnVsbDtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHZhciBoYW5kbGUgPSBidWZmZXIuYnVmZmVyO1xyXG4gICAgY2hlY2skMShoYW5kbGUsICdidWZmZXIgbXVzdCBub3QgYmUgZGVsZXRlZCBhbHJlYWR5Jyk7XHJcbiAgICBnbC5kZWxldGVCdWZmZXIoaGFuZGxlKTtcclxuICAgIGJ1ZmZlci5idWZmZXIgPSBudWxsO1xyXG4gICAgZGVsZXRlIGJ1ZmZlclNldFtidWZmZXIuaWRdO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gY3JlYXRlQnVmZmVyIChvcHRpb25zLCB0eXBlLCBkZWZlckluaXQsIHBlcnNpc3RlbnQpIHtcclxuICAgIHN0YXRzLmJ1ZmZlckNvdW50Kys7XHJcblxyXG4gICAgdmFyIGJ1ZmZlciA9IG5ldyBSRUdMQnVmZmVyKHR5cGUpO1xyXG4gICAgYnVmZmVyU2V0W2J1ZmZlci5pZF0gPSBidWZmZXI7XHJcblxyXG4gICAgZnVuY3Rpb24gcmVnbEJ1ZmZlciAob3B0aW9ucykge1xyXG4gICAgICB2YXIgdXNhZ2UgPSBHTF9TVEFUSUNfRFJBVztcclxuICAgICAgdmFyIGRhdGEgPSBudWxsO1xyXG4gICAgICB2YXIgYnl0ZUxlbmd0aCA9IDA7XHJcbiAgICAgIHZhciBkdHlwZSA9IDA7XHJcbiAgICAgIHZhciBkaW1lbnNpb24gPSAxO1xyXG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShvcHRpb25zKSB8fFxyXG4gICAgICAgICAgaXNUeXBlZEFycmF5KG9wdGlvbnMpIHx8XHJcbiAgICAgICAgICBpc05EQXJyYXlMaWtlKG9wdGlvbnMpKSB7XHJcbiAgICAgICAgZGF0YSA9IG9wdGlvbnM7XHJcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdudW1iZXInKSB7XHJcbiAgICAgICAgYnl0ZUxlbmd0aCA9IG9wdGlvbnMgfCAwO1xyXG4gICAgICB9IGVsc2UgaWYgKG9wdGlvbnMpIHtcclxuICAgICAgICBjaGVjayQxLnR5cGUoXHJcbiAgICAgICAgICBvcHRpb25zLCAnb2JqZWN0JyxcclxuICAgICAgICAgICdidWZmZXIgYXJndW1lbnRzIG11c3QgYmUgYW4gb2JqZWN0LCBhIG51bWJlciBvciBhbiBhcnJheScpO1xyXG5cclxuICAgICAgICBpZiAoJ2RhdGEnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgIGNoZWNrJDEoXHJcbiAgICAgICAgICAgIGRhdGEgPT09IG51bGwgfHxcclxuICAgICAgICAgICAgQXJyYXkuaXNBcnJheShkYXRhKSB8fFxyXG4gICAgICAgICAgICBpc1R5cGVkQXJyYXkoZGF0YSkgfHxcclxuICAgICAgICAgICAgaXNOREFycmF5TGlrZShkYXRhKSxcclxuICAgICAgICAgICAgJ2ludmFsaWQgZGF0YSBmb3IgYnVmZmVyJyk7XHJcbiAgICAgICAgICBkYXRhID0gb3B0aW9ucy5kYXRhO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKCd1c2FnZScgaW4gb3B0aW9ucykge1xyXG4gICAgICAgICAgY2hlY2skMS5wYXJhbWV0ZXIob3B0aW9ucy51c2FnZSwgdXNhZ2VUeXBlcywgJ2ludmFsaWQgYnVmZmVyIHVzYWdlJyk7XHJcbiAgICAgICAgICB1c2FnZSA9IHVzYWdlVHlwZXNbb3B0aW9ucy51c2FnZV07XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoJ3R5cGUnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgIGNoZWNrJDEucGFyYW1ldGVyKG9wdGlvbnMudHlwZSwgZ2xUeXBlcywgJ2ludmFsaWQgYnVmZmVyIHR5cGUnKTtcclxuICAgICAgICAgIGR0eXBlID0gZ2xUeXBlc1tvcHRpb25zLnR5cGVdO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKCdkaW1lbnNpb24nIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgIGNoZWNrJDEudHlwZShvcHRpb25zLmRpbWVuc2lvbiwgJ251bWJlcicsICdpbnZhbGlkIGRpbWVuc2lvbicpO1xyXG4gICAgICAgICAgZGltZW5zaW9uID0gb3B0aW9ucy5kaW1lbnNpb24gfCAwO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKCdsZW5ndGgnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgIGNoZWNrJDEubm5pKGJ5dGVMZW5ndGgsICdidWZmZXIgbGVuZ3RoIG11c3QgYmUgYSBub25uZWdhdGl2ZSBpbnRlZ2VyJyk7XHJcbiAgICAgICAgICBieXRlTGVuZ3RoID0gb3B0aW9ucy5sZW5ndGggfCAwO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgYnVmZmVyLmJpbmQoKTtcclxuICAgICAgaWYgKCFkYXRhKSB7XHJcbiAgICAgICAgLy8gIzQ3NVxyXG4gICAgICAgIGlmIChieXRlTGVuZ3RoKSBnbC5idWZmZXJEYXRhKGJ1ZmZlci50eXBlLCBieXRlTGVuZ3RoLCB1c2FnZSk7XHJcbiAgICAgICAgYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgR0xfVU5TSUdORURfQllURSQzO1xyXG4gICAgICAgIGJ1ZmZlci51c2FnZSA9IHVzYWdlO1xyXG4gICAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBkaW1lbnNpb247XHJcbiAgICAgICAgYnVmZmVyLmJ5dGVMZW5ndGggPSBieXRlTGVuZ3RoO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGluaXRCdWZmZXJGcm9tRGF0YShidWZmZXIsIGRhdGEsIHVzYWdlLCBkdHlwZSwgZGltZW5zaW9uLCBwZXJzaXN0ZW50KTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XHJcbiAgICAgICAgYnVmZmVyLnN0YXRzLnNpemUgPSBidWZmZXIuYnl0ZUxlbmd0aCAqIERUWVBFU19TSVpFU1tidWZmZXIuZHR5cGVdO1xyXG4gICAgICB9XHJcblxyXG4gICAgICByZXR1cm4gcmVnbEJ1ZmZlclxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHNldFN1YkRhdGEgKGRhdGEsIG9mZnNldCkge1xyXG4gICAgICBjaGVjayQxKG9mZnNldCArIGRhdGEuYnl0ZUxlbmd0aCA8PSBidWZmZXIuYnl0ZUxlbmd0aCxcclxuICAgICAgICAnaW52YWxpZCBidWZmZXIgc3ViZGF0YSBjYWxsLCBidWZmZXIgaXMgdG9vIHNtYWxsLiAnICsgJyBDYW5cXCd0IHdyaXRlIGRhdGEgb2Ygc2l6ZSAnICsgZGF0YS5ieXRlTGVuZ3RoICsgJyBzdGFydGluZyBmcm9tIG9mZnNldCAnICsgb2Zmc2V0ICsgJyB0byBhIGJ1ZmZlciBvZiBzaXplICcgKyBidWZmZXIuYnl0ZUxlbmd0aCk7XHJcblxyXG4gICAgICBnbC5idWZmZXJTdWJEYXRhKGJ1ZmZlci50eXBlLCBvZmZzZXQsIGRhdGEpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHN1YmRhdGEgKGRhdGEsIG9mZnNldF8pIHtcclxuICAgICAgdmFyIG9mZnNldCA9IChvZmZzZXRfIHx8IDApIHwgMDtcclxuICAgICAgdmFyIHNoYXBlO1xyXG4gICAgICBidWZmZXIuYmluZCgpO1xyXG4gICAgICBpZiAoaXNUeXBlZEFycmF5KGRhdGEpKSB7XHJcbiAgICAgICAgc2V0U3ViRGF0YShkYXRhLCBvZmZzZXQpO1xyXG4gICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcclxuICAgICAgICBpZiAoZGF0YS5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICBpZiAodHlwZW9mIGRhdGFbMF0gPT09ICdudW1iZXInKSB7XHJcbiAgICAgICAgICAgIHZhciBjb252ZXJ0ZWQgPSBwb29sLmFsbG9jVHlwZShidWZmZXIuZHR5cGUsIGRhdGEubGVuZ3RoKTtcclxuICAgICAgICAgICAgY29weUFycmF5KGNvbnZlcnRlZCwgZGF0YSk7XHJcbiAgICAgICAgICAgIHNldFN1YkRhdGEoY29udmVydGVkLCBvZmZzZXQpO1xyXG4gICAgICAgICAgICBwb29sLmZyZWVUeXBlKGNvbnZlcnRlZCk7XHJcbiAgICAgICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZGF0YVswXSkgfHwgaXNUeXBlZEFycmF5KGRhdGFbMF0pKSB7XHJcbiAgICAgICAgICAgIHNoYXBlID0gYXJyYXlTaGFwZShkYXRhKTtcclxuICAgICAgICAgICAgdmFyIGZsYXREYXRhID0gYXJyYXlGbGF0dGVuKGRhdGEsIHNoYXBlLCBidWZmZXIuZHR5cGUpO1xyXG4gICAgICAgICAgICBzZXRTdWJEYXRhKGZsYXREYXRhLCBvZmZzZXQpO1xyXG4gICAgICAgICAgICBwb29sLmZyZWVUeXBlKGZsYXREYXRhKTtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNoZWNrJDEucmFpc2UoJ2ludmFsaWQgYnVmZmVyIGRhdGEnKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSBpZiAoaXNOREFycmF5TGlrZShkYXRhKSkge1xyXG4gICAgICAgIHNoYXBlID0gZGF0YS5zaGFwZTtcclxuICAgICAgICB2YXIgc3RyaWRlID0gZGF0YS5zdHJpZGU7XHJcblxyXG4gICAgICAgIHZhciBzaGFwZVggPSAwO1xyXG4gICAgICAgIHZhciBzaGFwZVkgPSAwO1xyXG4gICAgICAgIHZhciBzdHJpZGVYID0gMDtcclxuICAgICAgICB2YXIgc3RyaWRlWSA9IDA7XHJcbiAgICAgICAgaWYgKHNoYXBlLmxlbmd0aCA9PT0gMSkge1xyXG4gICAgICAgICAgc2hhcGVYID0gc2hhcGVbMF07XHJcbiAgICAgICAgICBzaGFwZVkgPSAxO1xyXG4gICAgICAgICAgc3RyaWRlWCA9IHN0cmlkZVswXTtcclxuICAgICAgICAgIHN0cmlkZVkgPSAwO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoc2hhcGUubGVuZ3RoID09PSAyKSB7XHJcbiAgICAgICAgICBzaGFwZVggPSBzaGFwZVswXTtcclxuICAgICAgICAgIHNoYXBlWSA9IHNoYXBlWzFdO1xyXG4gICAgICAgICAgc3RyaWRlWCA9IHN0cmlkZVswXTtcclxuICAgICAgICAgIHN0cmlkZVkgPSBzdHJpZGVbMV07XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGNoZWNrJDEucmFpc2UoJ2ludmFsaWQgc2hhcGUnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdmFyIGR0eXBlID0gQXJyYXkuaXNBcnJheShkYXRhLmRhdGEpXHJcbiAgICAgICAgICA/IGJ1ZmZlci5kdHlwZVxyXG4gICAgICAgICAgOiB0eXBlZEFycmF5Q29kZShkYXRhLmRhdGEpO1xyXG5cclxuICAgICAgICB2YXIgdHJhbnNwb3NlRGF0YSA9IHBvb2wuYWxsb2NUeXBlKGR0eXBlLCBzaGFwZVggKiBzaGFwZVkpO1xyXG4gICAgICAgIHRyYW5zcG9zZSh0cmFuc3Bvc2VEYXRhLFxyXG4gICAgICAgICAgZGF0YS5kYXRhLFxyXG4gICAgICAgICAgc2hhcGVYLCBzaGFwZVksXHJcbiAgICAgICAgICBzdHJpZGVYLCBzdHJpZGVZLFxyXG4gICAgICAgICAgZGF0YS5vZmZzZXQpO1xyXG4gICAgICAgIHNldFN1YkRhdGEodHJhbnNwb3NlRGF0YSwgb2Zmc2V0KTtcclxuICAgICAgICBwb29sLmZyZWVUeXBlKHRyYW5zcG9zZURhdGEpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNoZWNrJDEucmFpc2UoJ2ludmFsaWQgZGF0YSBmb3IgYnVmZmVyIHN1YmRhdGEnKTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gcmVnbEJ1ZmZlclxyXG4gICAgfVxyXG5cclxuICAgIGlmICghZGVmZXJJbml0KSB7XHJcbiAgICAgIHJlZ2xCdWZmZXIob3B0aW9ucyk7XHJcbiAgICB9XHJcblxyXG4gICAgcmVnbEJ1ZmZlci5fcmVnbFR5cGUgPSAnYnVmZmVyJztcclxuICAgIHJlZ2xCdWZmZXIuX2J1ZmZlciA9IGJ1ZmZlcjtcclxuICAgIHJlZ2xCdWZmZXIuc3ViZGF0YSA9IHN1YmRhdGE7XHJcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcclxuICAgICAgcmVnbEJ1ZmZlci5zdGF0cyA9IGJ1ZmZlci5zdGF0cztcclxuICAgIH1cclxuICAgIHJlZ2xCdWZmZXIuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHsgZGVzdHJveShidWZmZXIpOyB9O1xyXG5cclxuICAgIHJldHVybiByZWdsQnVmZmVyXHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiByZXN0b3JlQnVmZmVycyAoKSB7XHJcbiAgICB2YWx1ZXMoYnVmZmVyU2V0KS5mb3JFYWNoKGZ1bmN0aW9uIChidWZmZXIpIHtcclxuICAgICAgYnVmZmVyLmJ1ZmZlciA9IGdsLmNyZWF0ZUJ1ZmZlcigpO1xyXG4gICAgICBnbC5iaW5kQnVmZmVyKGJ1ZmZlci50eXBlLCBidWZmZXIuYnVmZmVyKTtcclxuICAgICAgZ2wuYnVmZmVyRGF0YShcclxuICAgICAgICBidWZmZXIudHlwZSwgYnVmZmVyLnBlcnNpc3RlbnREYXRhIHx8IGJ1ZmZlci5ieXRlTGVuZ3RoLCBidWZmZXIudXNhZ2UpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcclxuICAgIHN0YXRzLmdldFRvdGFsQnVmZmVyU2l6ZSA9IGZ1bmN0aW9uICgpIHtcclxuICAgICAgdmFyIHRvdGFsID0gMDtcclxuICAgICAgLy8gVE9ETzogUmlnaHQgbm93LCB0aGUgc3RyZWFtcyBhcmUgbm90IHBhcnQgb2YgdGhlIHRvdGFsIGNvdW50LlxyXG4gICAgICBPYmplY3Qua2V5cyhidWZmZXJTZXQpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xyXG4gICAgICAgIHRvdGFsICs9IGJ1ZmZlclNldFtrZXldLnN0YXRzLnNpemU7XHJcbiAgICAgIH0pO1xyXG4gICAgICByZXR1cm4gdG90YWxcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICByZXR1cm4ge1xyXG4gICAgY3JlYXRlOiBjcmVhdGVCdWZmZXIsXHJcblxyXG4gICAgY3JlYXRlU3RyZWFtOiBjcmVhdGVTdHJlYW0sXHJcbiAgICBkZXN0cm95U3RyZWFtOiBkZXN0cm95U3RyZWFtLFxyXG5cclxuICAgIGNsZWFyOiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgIHZhbHVlcyhidWZmZXJTZXQpLmZvckVhY2goZGVzdHJveSk7XHJcbiAgICAgIHN0cmVhbVBvb2wuZm9yRWFjaChkZXN0cm95KTtcclxuICAgIH0sXHJcblxyXG4gICAgZ2V0QnVmZmVyOiBmdW5jdGlvbiAod3JhcHBlcikge1xyXG4gICAgICBpZiAod3JhcHBlciAmJiB3cmFwcGVyLl9idWZmZXIgaW5zdGFuY2VvZiBSRUdMQnVmZmVyKSB7XHJcbiAgICAgICAgcmV0dXJuIHdyYXBwZXIuX2J1ZmZlclxyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBudWxsXHJcbiAgICB9LFxyXG5cclxuICAgIHJlc3RvcmU6IHJlc3RvcmVCdWZmZXJzLFxyXG5cclxuICAgIF9pbml0QnVmZmVyOiBpbml0QnVmZmVyRnJvbURhdGFcclxuICB9XHJcbn1cblxudmFyIHBvaW50cyA9IDA7XG52YXIgcG9pbnQgPSAwO1xudmFyIGxpbmVzID0gMTtcbnZhciBsaW5lID0gMTtcbnZhciB0cmlhbmdsZXMgPSA0O1xudmFyIHRyaWFuZ2xlID0gNDtcbnZhciBwcmltVHlwZXMgPSB7XG5cdHBvaW50czogcG9pbnRzLFxuXHRwb2ludDogcG9pbnQsXG5cdGxpbmVzOiBsaW5lcyxcblx0bGluZTogbGluZSxcblx0dHJpYW5nbGVzOiB0cmlhbmdsZXMsXG5cdHRyaWFuZ2xlOiB0cmlhbmdsZSxcblx0XCJsaW5lIGxvb3BcIjogMixcblx0XCJsaW5lIHN0cmlwXCI6IDMsXG5cdFwidHJpYW5nbGUgc3RyaXBcIjogNSxcblx0XCJ0cmlhbmdsZSBmYW5cIjogNlxufTtcblxudmFyIEdMX1BPSU5UUyA9IDA7XHJcbnZhciBHTF9MSU5FUyA9IDE7XHJcbnZhciBHTF9UUklBTkdMRVMgPSA0O1xyXG5cclxudmFyIEdMX0JZVEUkMiA9IDUxMjA7XHJcbnZhciBHTF9VTlNJR05FRF9CWVRFJDQgPSA1MTIxO1xyXG52YXIgR0xfU0hPUlQkMiA9IDUxMjI7XHJcbnZhciBHTF9VTlNJR05FRF9TSE9SVCQyID0gNTEyMztcclxudmFyIEdMX0lOVCQyID0gNTEyNDtcclxudmFyIEdMX1VOU0lHTkVEX0lOVCQyID0gNTEyNTtcclxuXHJcbnZhciBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiA9IDM0OTYzO1xyXG5cclxudmFyIEdMX1NUUkVBTV9EUkFXJDEgPSAweDg4RTA7XHJcbnZhciBHTF9TVEFUSUNfRFJBVyQxID0gMHg4OEU0O1xyXG5cclxuZnVuY3Rpb24gd3JhcEVsZW1lbnRzU3RhdGUgKGdsLCBleHRlbnNpb25zLCBidWZmZXJTdGF0ZSwgc3RhdHMpIHtcclxuICB2YXIgZWxlbWVudFNldCA9IHt9O1xyXG4gIHZhciBlbGVtZW50Q291bnQgPSAwO1xyXG5cclxuICB2YXIgZWxlbWVudFR5cGVzID0ge1xyXG4gICAgJ3VpbnQ4JzogR0xfVU5TSUdORURfQllURSQ0LFxyXG4gICAgJ3VpbnQxNic6IEdMX1VOU0lHTkVEX1NIT1JUJDJcclxuICB9O1xyXG5cclxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfZWxlbWVudF9pbmRleF91aW50KSB7XHJcbiAgICBlbGVtZW50VHlwZXMudWludDMyID0gR0xfVU5TSUdORURfSU5UJDI7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBSRUdMRWxlbWVudEJ1ZmZlciAoYnVmZmVyKSB7XHJcbiAgICB0aGlzLmlkID0gZWxlbWVudENvdW50Kys7XHJcbiAgICBlbGVtZW50U2V0W3RoaXMuaWRdID0gdGhpcztcclxuICAgIHRoaXMuYnVmZmVyID0gYnVmZmVyO1xyXG4gICAgdGhpcy5wcmltVHlwZSA9IEdMX1RSSUFOR0xFUztcclxuICAgIHRoaXMudmVydENvdW50ID0gMDtcclxuICAgIHRoaXMudHlwZSA9IDA7XHJcbiAgfVxyXG5cclxuICBSRUdMRWxlbWVudEJ1ZmZlci5wcm90b3R5cGUuYmluZCA9IGZ1bmN0aW9uICgpIHtcclxuICAgIHRoaXMuYnVmZmVyLmJpbmQoKTtcclxuICB9O1xyXG5cclxuICB2YXIgYnVmZmVyUG9vbCA9IFtdO1xyXG5cclxuICBmdW5jdGlvbiBjcmVhdGVFbGVtZW50U3RyZWFtIChkYXRhKSB7XHJcbiAgICB2YXIgcmVzdWx0ID0gYnVmZmVyUG9vbC5wb3AoKTtcclxuICAgIGlmICghcmVzdWx0KSB7XHJcbiAgICAgIHJlc3VsdCA9IG5ldyBSRUdMRWxlbWVudEJ1ZmZlcihidWZmZXJTdGF0ZS5jcmVhdGUoXHJcbiAgICAgICAgbnVsbCxcclxuICAgICAgICBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUixcclxuICAgICAgICB0cnVlLFxyXG4gICAgICAgIGZhbHNlKS5fYnVmZmVyKTtcclxuICAgIH1cclxuICAgIGluaXRFbGVtZW50cyhyZXN1bHQsIGRhdGEsIEdMX1NUUkVBTV9EUkFXJDEsIC0xLCAtMSwgMCwgMCk7XHJcbiAgICByZXR1cm4gcmVzdWx0XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBkZXN0cm95RWxlbWVudFN0cmVhbSAoZWxlbWVudHMpIHtcclxuICAgIGJ1ZmZlclBvb2wucHVzaChlbGVtZW50cyk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBpbml0RWxlbWVudHMgKFxyXG4gICAgZWxlbWVudHMsXHJcbiAgICBkYXRhLFxyXG4gICAgdXNhZ2UsXHJcbiAgICBwcmltLFxyXG4gICAgY291bnQsXHJcbiAgICBieXRlTGVuZ3RoLFxyXG4gICAgdHlwZSkge1xyXG4gICAgZWxlbWVudHMuYnVmZmVyLmJpbmQoKTtcclxuICAgIGlmIChkYXRhKSB7XHJcbiAgICAgIHZhciBwcmVkaWN0ZWRUeXBlID0gdHlwZTtcclxuICAgICAgaWYgKCF0eXBlICYmIChcclxuICAgICAgICAgICFpc1R5cGVkQXJyYXkoZGF0YSkgfHxcclxuICAgICAgICAgKGlzTkRBcnJheUxpa2UoZGF0YSkgJiYgIWlzVHlwZWRBcnJheShkYXRhLmRhdGEpKSkpIHtcclxuICAgICAgICBwcmVkaWN0ZWRUeXBlID0gZXh0ZW5zaW9ucy5vZXNfZWxlbWVudF9pbmRleF91aW50XHJcbiAgICAgICAgICA/IEdMX1VOU0lHTkVEX0lOVCQyXHJcbiAgICAgICAgICA6IEdMX1VOU0lHTkVEX1NIT1JUJDI7XHJcbiAgICAgIH1cclxuICAgICAgYnVmZmVyU3RhdGUuX2luaXRCdWZmZXIoXHJcbiAgICAgICAgZWxlbWVudHMuYnVmZmVyLFxyXG4gICAgICAgIGRhdGEsXHJcbiAgICAgICAgdXNhZ2UsXHJcbiAgICAgICAgcHJlZGljdGVkVHlwZSxcclxuICAgICAgICAzKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGdsLmJ1ZmZlckRhdGEoR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIsIGJ5dGVMZW5ndGgsIHVzYWdlKTtcclxuICAgICAgZWxlbWVudHMuYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgR0xfVU5TSUdORURfQllURSQ0O1xyXG4gICAgICBlbGVtZW50cy5idWZmZXIudXNhZ2UgPSB1c2FnZTtcclxuICAgICAgZWxlbWVudHMuYnVmZmVyLmRpbWVuc2lvbiA9IDM7XHJcbiAgICAgIGVsZW1lbnRzLmJ1ZmZlci5ieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aDtcclxuICAgIH1cclxuXHJcbiAgICB2YXIgZHR5cGUgPSB0eXBlO1xyXG4gICAgaWYgKCF0eXBlKSB7XHJcbiAgICAgIHN3aXRjaCAoZWxlbWVudHMuYnVmZmVyLmR0eXBlKSB7XHJcbiAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9CWVRFJDQ6XHJcbiAgICAgICAgY2FzZSBHTF9CWVRFJDI6XHJcbiAgICAgICAgICBkdHlwZSA9IEdMX1VOU0lHTkVEX0JZVEUkNDtcclxuICAgICAgICAgIGJyZWFrXHJcblxyXG4gICAgICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlQkMjpcclxuICAgICAgICBjYXNlIEdMX1NIT1JUJDI6XHJcbiAgICAgICAgICBkdHlwZSA9IEdMX1VOU0lHTkVEX1NIT1JUJDI7XHJcbiAgICAgICAgICBicmVha1xyXG5cclxuICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX0lOVCQyOlxyXG4gICAgICAgIGNhc2UgR0xfSU5UJDI6XHJcbiAgICAgICAgICBkdHlwZSA9IEdMX1VOU0lHTkVEX0lOVCQyO1xyXG4gICAgICAgICAgYnJlYWtcclxuXHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgIGNoZWNrJDEucmFpc2UoJ3Vuc3VwcG9ydGVkIHR5cGUgZm9yIGVsZW1lbnQgYXJyYXknKTtcclxuICAgICAgfVxyXG4gICAgICBlbGVtZW50cy5idWZmZXIuZHR5cGUgPSBkdHlwZTtcclxuICAgIH1cclxuICAgIGVsZW1lbnRzLnR5cGUgPSBkdHlwZTtcclxuXHJcbiAgICAvLyBDaGVjayBvZXNfZWxlbWVudF9pbmRleF91aW50IGV4dGVuc2lvblxyXG4gICAgY2hlY2skMShcclxuICAgICAgZHR5cGUgIT09IEdMX1VOU0lHTkVEX0lOVCQyIHx8XHJcbiAgICAgICEhZXh0ZW5zaW9ucy5vZXNfZWxlbWVudF9pbmRleF91aW50LFxyXG4gICAgICAnMzIgYml0IGVsZW1lbnQgYnVmZmVycyBub3Qgc3VwcG9ydGVkLCBlbmFibGUgb2VzX2VsZW1lbnRfaW5kZXhfdWludCBmaXJzdCcpO1xyXG5cclxuICAgIC8vIHRyeSB0byBndWVzcyBkZWZhdWx0IHByaW1pdGl2ZSB0eXBlIGFuZCBhcmd1bWVudHNcclxuICAgIHZhciB2ZXJ0Q291bnQgPSBjb3VudDtcclxuICAgIGlmICh2ZXJ0Q291bnQgPCAwKSB7XHJcbiAgICAgIHZlcnRDb3VudCA9IGVsZW1lbnRzLmJ1ZmZlci5ieXRlTGVuZ3RoO1xyXG4gICAgICBpZiAoZHR5cGUgPT09IEdMX1VOU0lHTkVEX1NIT1JUJDIpIHtcclxuICAgICAgICB2ZXJ0Q291bnQgPj49IDE7XHJcbiAgICAgIH0gZWxzZSBpZiAoZHR5cGUgPT09IEdMX1VOU0lHTkVEX0lOVCQyKSB7XHJcbiAgICAgICAgdmVydENvdW50ID4+PSAyO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBlbGVtZW50cy52ZXJ0Q291bnQgPSB2ZXJ0Q291bnQ7XHJcblxyXG4gICAgLy8gdHJ5IHRvIGd1ZXNzIHByaW1pdGl2ZSB0eXBlIGZyb20gY2VsbCBkaW1lbnNpb25cclxuICAgIHZhciBwcmltVHlwZSA9IHByaW07XHJcbiAgICBpZiAocHJpbSA8IDApIHtcclxuICAgICAgcHJpbVR5cGUgPSBHTF9UUklBTkdMRVM7XHJcbiAgICAgIHZhciBkaW1lbnNpb24gPSBlbGVtZW50cy5idWZmZXIuZGltZW5zaW9uO1xyXG4gICAgICBpZiAoZGltZW5zaW9uID09PSAxKSBwcmltVHlwZSA9IEdMX1BPSU5UUztcclxuICAgICAgaWYgKGRpbWVuc2lvbiA9PT0gMikgcHJpbVR5cGUgPSBHTF9MSU5FUztcclxuICAgICAgaWYgKGRpbWVuc2lvbiA9PT0gMykgcHJpbVR5cGUgPSBHTF9UUklBTkdMRVM7XHJcbiAgICB9XHJcbiAgICBlbGVtZW50cy5wcmltVHlwZSA9IHByaW1UeXBlO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZGVzdHJveUVsZW1lbnRzIChlbGVtZW50cykge1xyXG4gICAgc3RhdHMuZWxlbWVudHNDb3VudC0tO1xyXG5cclxuICAgIGNoZWNrJDEoZWxlbWVudHMuYnVmZmVyICE9PSBudWxsLCAnbXVzdCBub3QgZG91YmxlIGRlc3Ryb3kgZWxlbWVudHMnKTtcclxuICAgIGRlbGV0ZSBlbGVtZW50U2V0W2VsZW1lbnRzLmlkXTtcclxuICAgIGVsZW1lbnRzLmJ1ZmZlci5kZXN0cm95KCk7XHJcbiAgICBlbGVtZW50cy5idWZmZXIgPSBudWxsO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gY3JlYXRlRWxlbWVudHMgKG9wdGlvbnMsIHBlcnNpc3RlbnQpIHtcclxuICAgIHZhciBidWZmZXIgPSBidWZmZXJTdGF0ZS5jcmVhdGUobnVsbCwgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIsIHRydWUpO1xyXG4gICAgdmFyIGVsZW1lbnRzID0gbmV3IFJFR0xFbGVtZW50QnVmZmVyKGJ1ZmZlci5fYnVmZmVyKTtcclxuICAgIHN0YXRzLmVsZW1lbnRzQ291bnQrKztcclxuXHJcbiAgICBmdW5jdGlvbiByZWdsRWxlbWVudHMgKG9wdGlvbnMpIHtcclxuICAgICAgaWYgKCFvcHRpb25zKSB7XHJcbiAgICAgICAgYnVmZmVyKCk7XHJcbiAgICAgICAgZWxlbWVudHMucHJpbVR5cGUgPSBHTF9UUklBTkdMRVM7XHJcbiAgICAgICAgZWxlbWVudHMudmVydENvdW50ID0gMDtcclxuICAgICAgICBlbGVtZW50cy50eXBlID0gR0xfVU5TSUdORURfQllURSQ0O1xyXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBvcHRpb25zID09PSAnbnVtYmVyJykge1xyXG4gICAgICAgIGJ1ZmZlcihvcHRpb25zKTtcclxuICAgICAgICBlbGVtZW50cy5wcmltVHlwZSA9IEdMX1RSSUFOR0xFUztcclxuICAgICAgICBlbGVtZW50cy52ZXJ0Q291bnQgPSBvcHRpb25zIHwgMDtcclxuICAgICAgICBlbGVtZW50cy50eXBlID0gR0xfVU5TSUdORURfQllURSQ0O1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHZhciBkYXRhID0gbnVsbDtcclxuICAgICAgICB2YXIgdXNhZ2UgPSBHTF9TVEFUSUNfRFJBVyQxO1xyXG4gICAgICAgIHZhciBwcmltVHlwZSA9IC0xO1xyXG4gICAgICAgIHZhciB2ZXJ0Q291bnQgPSAtMTtcclxuICAgICAgICB2YXIgYnl0ZUxlbmd0aCA9IDA7XHJcbiAgICAgICAgdmFyIGR0eXBlID0gMDtcclxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShvcHRpb25zKSB8fFxyXG4gICAgICAgICAgICBpc1R5cGVkQXJyYXkob3B0aW9ucykgfHxcclxuICAgICAgICAgICAgaXNOREFycmF5TGlrZShvcHRpb25zKSkge1xyXG4gICAgICAgICAgZGF0YSA9IG9wdGlvbnM7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGNoZWNrJDEudHlwZShvcHRpb25zLCAnb2JqZWN0JywgJ2ludmFsaWQgYXJndW1lbnRzIGZvciBlbGVtZW50cycpO1xyXG4gICAgICAgICAgaWYgKCdkYXRhJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgICAgIGRhdGEgPSBvcHRpb25zLmRhdGE7XHJcbiAgICAgICAgICAgIGNoZWNrJDEoXHJcbiAgICAgICAgICAgICAgICBBcnJheS5pc0FycmF5KGRhdGEpIHx8XHJcbiAgICAgICAgICAgICAgICBpc1R5cGVkQXJyYXkoZGF0YSkgfHxcclxuICAgICAgICAgICAgICAgIGlzTkRBcnJheUxpa2UoZGF0YSksXHJcbiAgICAgICAgICAgICAgICAnaW52YWxpZCBkYXRhIGZvciBlbGVtZW50IGJ1ZmZlcicpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgaWYgKCd1c2FnZScgaW4gb3B0aW9ucykge1xyXG4gICAgICAgICAgICBjaGVjayQxLnBhcmFtZXRlcihcclxuICAgICAgICAgICAgICBvcHRpb25zLnVzYWdlLFxyXG4gICAgICAgICAgICAgIHVzYWdlVHlwZXMsXHJcbiAgICAgICAgICAgICAgJ2ludmFsaWQgZWxlbWVudCBidWZmZXIgdXNhZ2UnKTtcclxuICAgICAgICAgICAgdXNhZ2UgPSB1c2FnZVR5cGVzW29wdGlvbnMudXNhZ2VdO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgaWYgKCdwcmltaXRpdmUnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgICAgY2hlY2skMS5wYXJhbWV0ZXIoXHJcbiAgICAgICAgICAgICAgb3B0aW9ucy5wcmltaXRpdmUsXHJcbiAgICAgICAgICAgICAgcHJpbVR5cGVzLFxyXG4gICAgICAgICAgICAgICdpbnZhbGlkIGVsZW1lbnQgYnVmZmVyIHByaW1pdGl2ZScpO1xyXG4gICAgICAgICAgICBwcmltVHlwZSA9IHByaW1UeXBlc1tvcHRpb25zLnByaW1pdGl2ZV07XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBpZiAoJ2NvdW50JyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgICAgIGNoZWNrJDEoXHJcbiAgICAgICAgICAgICAgdHlwZW9mIG9wdGlvbnMuY291bnQgPT09ICdudW1iZXInICYmIG9wdGlvbnMuY291bnQgPj0gMCxcclxuICAgICAgICAgICAgICAnaW52YWxpZCB2ZXJ0ZXggY291bnQgZm9yIGVsZW1lbnRzJyk7XHJcbiAgICAgICAgICAgIHZlcnRDb3VudCA9IG9wdGlvbnMuY291bnQgfCAwO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgaWYgKCd0eXBlJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgICAgIGNoZWNrJDEucGFyYW1ldGVyKFxyXG4gICAgICAgICAgICAgIG9wdGlvbnMudHlwZSxcclxuICAgICAgICAgICAgICBlbGVtZW50VHlwZXMsXHJcbiAgICAgICAgICAgICAgJ2ludmFsaWQgYnVmZmVyIHR5cGUnKTtcclxuICAgICAgICAgICAgZHR5cGUgPSBlbGVtZW50VHlwZXNbb3B0aW9ucy50eXBlXTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGlmICgnbGVuZ3RoJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgICAgIGJ5dGVMZW5ndGggPSBvcHRpb25zLmxlbmd0aCB8IDA7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBieXRlTGVuZ3RoID0gdmVydENvdW50O1xyXG4gICAgICAgICAgICBpZiAoZHR5cGUgPT09IEdMX1VOU0lHTkVEX1NIT1JUJDIgfHwgZHR5cGUgPT09IEdMX1NIT1JUJDIpIHtcclxuICAgICAgICAgICAgICBieXRlTGVuZ3RoICo9IDI7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZHR5cGUgPT09IEdMX1VOU0lHTkVEX0lOVCQyIHx8IGR0eXBlID09PSBHTF9JTlQkMikge1xyXG4gICAgICAgICAgICAgIGJ5dGVMZW5ndGggKj0gNDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBpbml0RWxlbWVudHMoXHJcbiAgICAgICAgICBlbGVtZW50cyxcclxuICAgICAgICAgIGRhdGEsXHJcbiAgICAgICAgICB1c2FnZSxcclxuICAgICAgICAgIHByaW1UeXBlLFxyXG4gICAgICAgICAgdmVydENvdW50LFxyXG4gICAgICAgICAgYnl0ZUxlbmd0aCxcclxuICAgICAgICAgIGR0eXBlKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuIHJlZ2xFbGVtZW50c1xyXG4gICAgfVxyXG5cclxuICAgIHJlZ2xFbGVtZW50cyhvcHRpb25zKTtcclxuXHJcbiAgICByZWdsRWxlbWVudHMuX3JlZ2xUeXBlID0gJ2VsZW1lbnRzJztcclxuICAgIHJlZ2xFbGVtZW50cy5fZWxlbWVudHMgPSBlbGVtZW50cztcclxuICAgIHJlZ2xFbGVtZW50cy5zdWJkYXRhID0gZnVuY3Rpb24gKGRhdGEsIG9mZnNldCkge1xyXG4gICAgICBidWZmZXIuc3ViZGF0YShkYXRhLCBvZmZzZXQpO1xyXG4gICAgICByZXR1cm4gcmVnbEVsZW1lbnRzXHJcbiAgICB9O1xyXG4gICAgcmVnbEVsZW1lbnRzLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XHJcbiAgICAgIGRlc3Ryb3lFbGVtZW50cyhlbGVtZW50cyk7XHJcbiAgICB9O1xyXG5cclxuICAgIHJldHVybiByZWdsRWxlbWVudHNcclxuICB9XHJcblxyXG4gIHJldHVybiB7XHJcbiAgICBjcmVhdGU6IGNyZWF0ZUVsZW1lbnRzLFxyXG4gICAgY3JlYXRlU3RyZWFtOiBjcmVhdGVFbGVtZW50U3RyZWFtLFxyXG4gICAgZGVzdHJveVN0cmVhbTogZGVzdHJveUVsZW1lbnRTdHJlYW0sXHJcbiAgICBnZXRFbGVtZW50czogZnVuY3Rpb24gKGVsZW1lbnRzKSB7XHJcbiAgICAgIGlmICh0eXBlb2YgZWxlbWVudHMgPT09ICdmdW5jdGlvbicgJiZcclxuICAgICAgICAgIGVsZW1lbnRzLl9lbGVtZW50cyBpbnN0YW5jZW9mIFJFR0xFbGVtZW50QnVmZmVyKSB7XHJcbiAgICAgICAgcmV0dXJuIGVsZW1lbnRzLl9lbGVtZW50c1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBudWxsXHJcbiAgICB9LFxyXG4gICAgY2xlYXI6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgdmFsdWVzKGVsZW1lbnRTZXQpLmZvckVhY2goZGVzdHJveUVsZW1lbnRzKTtcclxuICAgIH1cclxuICB9XHJcbn1cblxudmFyIEZMT0FUID0gbmV3IEZsb2F0MzJBcnJheSgxKTtcclxudmFyIElOVCA9IG5ldyBVaW50MzJBcnJheShGTE9BVC5idWZmZXIpO1xyXG5cclxudmFyIEdMX1VOU0lHTkVEX1NIT1JUJDQgPSA1MTIzO1xyXG5cclxuZnVuY3Rpb24gY29udmVydFRvSGFsZkZsb2F0IChhcnJheSkge1xyXG4gIHZhciB1c2hvcnRzID0gcG9vbC5hbGxvY1R5cGUoR0xfVU5TSUdORURfU0hPUlQkNCwgYXJyYXkubGVuZ3RoKTtcclxuXHJcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnJheS5sZW5ndGg7ICsraSkge1xyXG4gICAgaWYgKGlzTmFOKGFycmF5W2ldKSkge1xyXG4gICAgICB1c2hvcnRzW2ldID0gMHhmZmZmO1xyXG4gICAgfSBlbHNlIGlmIChhcnJheVtpXSA9PT0gSW5maW5pdHkpIHtcclxuICAgICAgdXNob3J0c1tpXSA9IDB4N2MwMDtcclxuICAgIH0gZWxzZSBpZiAoYXJyYXlbaV0gPT09IC1JbmZpbml0eSkge1xyXG4gICAgICB1c2hvcnRzW2ldID0gMHhmYzAwO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgRkxPQVRbMF0gPSBhcnJheVtpXTtcclxuICAgICAgdmFyIHggPSBJTlRbMF07XHJcblxyXG4gICAgICB2YXIgc2duID0gKHggPj4+IDMxKSA8PCAxNTtcclxuICAgICAgdmFyIGV4cCA9ICgoeCA8PCAxKSA+Pj4gMjQpIC0gMTI3O1xyXG4gICAgICB2YXIgZnJhYyA9ICh4ID4+IDEzKSAmICgoMSA8PCAxMCkgLSAxKTtcclxuXHJcbiAgICAgIGlmIChleHAgPCAtMjQpIHtcclxuICAgICAgICAvLyByb3VuZCBub24tcmVwcmVzZW50YWJsZSBkZW5vcm1hbHMgdG8gMFxyXG4gICAgICAgIHVzaG9ydHNbaV0gPSBzZ247XHJcbiAgICAgIH0gZWxzZSBpZiAoZXhwIDwgLTE0KSB7XHJcbiAgICAgICAgLy8gaGFuZGxlIGRlbm9ybWFsc1xyXG4gICAgICAgIHZhciBzID0gLTE0IC0gZXhwO1xyXG4gICAgICAgIHVzaG9ydHNbaV0gPSBzZ24gKyAoKGZyYWMgKyAoMSA8PCAxMCkpID4+IHMpO1xyXG4gICAgICB9IGVsc2UgaWYgKGV4cCA+IDE1KSB7XHJcbiAgICAgICAgLy8gcm91bmQgb3ZlcmZsb3cgdG8gKy8tIEluZmluaXR5XHJcbiAgICAgICAgdXNob3J0c1tpXSA9IHNnbiArIDB4N2MwMDtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBvdGhlcndpc2UgY29udmVydCBkaXJlY3RseVxyXG4gICAgICAgIHVzaG9ydHNbaV0gPSBzZ24gKyAoKGV4cCArIDE1KSA8PCAxMCkgKyBmcmFjO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICByZXR1cm4gdXNob3J0c1xyXG59XG5cbmZ1bmN0aW9uIGlzQXJyYXlMaWtlIChzKSB7XHJcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkocykgfHwgaXNUeXBlZEFycmF5KHMpXHJcbn1cblxudmFyIGlzUG93MiQxID0gZnVuY3Rpb24gKHYpIHtcclxuICByZXR1cm4gISh2ICYgKHYgLSAxKSkgJiYgKCEhdilcclxufTtcblxudmFyIEdMX0NPTVBSRVNTRURfVEVYVFVSRV9GT1JNQVRTID0gMHg4NkEzO1xyXG5cclxudmFyIEdMX1RFWFRVUkVfMkQkMSA9IDB4MERFMTtcclxudmFyIEdMX1RFWFRVUkVfQ1VCRV9NQVAkMSA9IDB4ODUxMztcclxudmFyIEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCQxID0gMHg4NTE1O1xyXG5cclxudmFyIEdMX1JHQkEkMSA9IDB4MTkwODtcclxudmFyIEdMX0FMUEhBID0gMHgxOTA2O1xyXG52YXIgR0xfUkdCID0gMHgxOTA3O1xyXG52YXIgR0xfTFVNSU5BTkNFID0gMHgxOTA5O1xyXG52YXIgR0xfTFVNSU5BTkNFX0FMUEhBID0gMHgxOTBBO1xyXG5cclxudmFyIEdMX1JHQkE0ID0gMHg4MDU2O1xyXG52YXIgR0xfUkdCNV9BMSA9IDB4ODA1NztcclxudmFyIEdMX1JHQjU2NSA9IDB4OEQ2MjtcclxuXHJcbnZhciBHTF9VTlNJR05FRF9TSE9SVF80XzRfNF80JDEgPSAweDgwMzM7XHJcbnZhciBHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xJDEgPSAweDgwMzQ7XHJcbnZhciBHTF9VTlNJR05FRF9TSE9SVF81XzZfNSQxID0gMHg4MzYzO1xyXG52YXIgR0xfVU5TSUdORURfSU5UXzI0XzhfV0VCR0wkMSA9IDB4ODRGQTtcclxuXHJcbnZhciBHTF9ERVBUSF9DT01QT05FTlQgPSAweDE5MDI7XHJcbnZhciBHTF9ERVBUSF9TVEVOQ0lMID0gMHg4NEY5O1xyXG5cclxudmFyIEdMX1NSR0JfRVhUID0gMHg4QzQwO1xyXG52YXIgR0xfU1JHQl9BTFBIQV9FWFQgPSAweDhDNDI7XHJcblxyXG52YXIgR0xfSEFMRl9GTE9BVF9PRVMkMSA9IDB4OEQ2MTtcclxuXHJcbnZhciBHTF9DT01QUkVTU0VEX1JHQl9TM1RDX0RYVDFfRVhUID0gMHg4M0YwO1xyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUMV9FWFQgPSAweDgzRjE7XHJcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQzX0VYVCA9IDB4ODNGMjtcclxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDVfRVhUID0gMHg4M0YzO1xyXG5cclxudmFyIEdMX0NPTVBSRVNTRURfUkdCX0FUQ19XRUJHTCA9IDB4OEM5MjtcclxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9BVENfRVhQTElDSVRfQUxQSEFfV0VCR0wgPSAweDhDOTM7XHJcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfQVRDX0lOVEVSUE9MQVRFRF9BTFBIQV9XRUJHTCA9IDB4ODdFRTtcclxuXHJcbnZhciBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ180QlBQVjFfSU1HID0gMHg4QzAwO1xyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfMkJQUFYxX0lNRyA9IDB4OEMwMTtcclxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ180QlBQVjFfSU1HID0gMHg4QzAyO1xyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzJCUFBWMV9JTUcgPSAweDhDMDM7XHJcblxyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfRVRDMV9XRUJHTCA9IDB4OEQ2NDtcclxuXHJcbnZhciBHTF9VTlNJR05FRF9CWVRFJDUgPSAweDE0MDE7XHJcbnZhciBHTF9VTlNJR05FRF9TSE9SVCQzID0gMHgxNDAzO1xyXG52YXIgR0xfVU5TSUdORURfSU5UJDMgPSAweDE0MDU7XHJcbnZhciBHTF9GTE9BVCQ0ID0gMHgxNDA2O1xyXG5cclxudmFyIEdMX1RFWFRVUkVfV1JBUF9TID0gMHgyODAyO1xyXG52YXIgR0xfVEVYVFVSRV9XUkFQX1QgPSAweDI4MDM7XHJcblxyXG52YXIgR0xfUkVQRUFUID0gMHgyOTAxO1xyXG52YXIgR0xfQ0xBTVBfVE9fRURHRSQxID0gMHg4MTJGO1xyXG52YXIgR0xfTUlSUk9SRURfUkVQRUFUID0gMHg4MzcwO1xyXG5cclxudmFyIEdMX1RFWFRVUkVfTUFHX0ZJTFRFUiA9IDB4MjgwMDtcclxudmFyIEdMX1RFWFRVUkVfTUlOX0ZJTFRFUiA9IDB4MjgwMTtcclxuXHJcbnZhciBHTF9ORUFSRVNUJDEgPSAweDI2MDA7XHJcbnZhciBHTF9MSU5FQVIgPSAweDI2MDE7XHJcbnZhciBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNUJDEgPSAweDI3MDA7XHJcbnZhciBHTF9MSU5FQVJfTUlQTUFQX05FQVJFU1QkMSA9IDB4MjcwMTtcclxudmFyIEdMX05FQVJFU1RfTUlQTUFQX0xJTkVBUiQxID0gMHgyNzAyO1xyXG52YXIgR0xfTElORUFSX01JUE1BUF9MSU5FQVIkMSA9IDB4MjcwMztcclxuXHJcbnZhciBHTF9HRU5FUkFURV9NSVBNQVBfSElOVCA9IDB4ODE5MjtcclxudmFyIEdMX0RPTlRfQ0FSRSA9IDB4MTEwMDtcclxudmFyIEdMX0ZBU1RFU1QgPSAweDExMDE7XHJcbnZhciBHTF9OSUNFU1QgPSAweDExMDI7XHJcblxyXG52YXIgR0xfVEVYVFVSRV9NQVhfQU5JU09UUk9QWV9FWFQgPSAweDg0RkU7XHJcblxyXG52YXIgR0xfVU5QQUNLX0FMSUdOTUVOVCA9IDB4MENGNTtcclxudmFyIEdMX1VOUEFDS19GTElQX1lfV0VCR0wgPSAweDkyNDA7XHJcbnZhciBHTF9VTlBBQ0tfUFJFTVVMVElQTFlfQUxQSEFfV0VCR0wgPSAweDkyNDE7XHJcbnZhciBHTF9VTlBBQ0tfQ09MT1JTUEFDRV9DT05WRVJTSU9OX1dFQkdMID0gMHg5MjQzO1xyXG5cclxudmFyIEdMX0JST1dTRVJfREVGQVVMVF9XRUJHTCA9IDB4OTI0NDtcclxuXHJcbnZhciBHTF9URVhUVVJFMCQxID0gMHg4NEMwO1xyXG5cclxudmFyIE1JUE1BUF9GSUxURVJTID0gW1xyXG4gIEdMX05FQVJFU1RfTUlQTUFQX05FQVJFU1QkMSxcclxuICBHTF9ORUFSRVNUX01JUE1BUF9MSU5FQVIkMSxcclxuICBHTF9MSU5FQVJfTUlQTUFQX05FQVJFU1QkMSxcclxuICBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUiQxXHJcbl07XHJcblxyXG52YXIgQ0hBTk5FTFNfRk9STUFUID0gW1xyXG4gIDAsXHJcbiAgR0xfTFVNSU5BTkNFLFxyXG4gIEdMX0xVTUlOQU5DRV9BTFBIQSxcclxuICBHTF9SR0IsXHJcbiAgR0xfUkdCQSQxXHJcbl07XHJcblxyXG52YXIgRk9STUFUX0NIQU5ORUxTID0ge307XHJcbkZPUk1BVF9DSEFOTkVMU1tHTF9MVU1JTkFOQ0VdID1cclxuRk9STUFUX0NIQU5ORUxTW0dMX0FMUEhBXSA9XHJcbkZPUk1BVF9DSEFOTkVMU1tHTF9ERVBUSF9DT01QT05FTlRdID0gMTtcclxuRk9STUFUX0NIQU5ORUxTW0dMX0RFUFRIX1NURU5DSUxdID1cclxuRk9STUFUX0NIQU5ORUxTW0dMX0xVTUlOQU5DRV9BTFBIQV0gPSAyO1xyXG5GT1JNQVRfQ0hBTk5FTFNbR0xfUkdCXSA9XHJcbkZPUk1BVF9DSEFOTkVMU1tHTF9TUkdCX0VYVF0gPSAzO1xyXG5GT1JNQVRfQ0hBTk5FTFNbR0xfUkdCQSQxXSA9XHJcbkZPUk1BVF9DSEFOTkVMU1tHTF9TUkdCX0FMUEhBX0VYVF0gPSA0O1xyXG5cclxuZnVuY3Rpb24gb2JqZWN0TmFtZSAoc3RyKSB7XHJcbiAgcmV0dXJuICdbb2JqZWN0ICcgKyBzdHIgKyAnXSdcclxufVxyXG5cclxudmFyIENBTlZBU19DTEFTUyA9IG9iamVjdE5hbWUoJ0hUTUxDYW52YXNFbGVtZW50Jyk7XHJcbnZhciBDT05URVhUMkRfQ0xBU1MgPSBvYmplY3ROYW1lKCdDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQnKTtcclxudmFyIEJJVE1BUF9DTEFTUyA9IG9iamVjdE5hbWUoJ0ltYWdlQml0bWFwJyk7XHJcbnZhciBJTUFHRV9DTEFTUyA9IG9iamVjdE5hbWUoJ0hUTUxJbWFnZUVsZW1lbnQnKTtcclxudmFyIFZJREVPX0NMQVNTID0gb2JqZWN0TmFtZSgnSFRNTFZpZGVvRWxlbWVudCcpO1xyXG5cclxudmFyIFBJWEVMX0NMQVNTRVMgPSBPYmplY3Qua2V5cyhhcnJheVR5cGVzKS5jb25jYXQoW1xyXG4gIENBTlZBU19DTEFTUyxcclxuICBDT05URVhUMkRfQ0xBU1MsXHJcbiAgQklUTUFQX0NMQVNTLFxyXG4gIElNQUdFX0NMQVNTLFxyXG4gIFZJREVPX0NMQVNTXHJcbl0pO1xyXG5cclxuLy8gZm9yIGV2ZXJ5IHRleHR1cmUgdHlwZSwgc3RvcmVcclxuLy8gdGhlIHNpemUgaW4gYnl0ZXMuXHJcbnZhciBUWVBFX1NJWkVTID0gW107XHJcblRZUEVfU0laRVNbR0xfVU5TSUdORURfQllURSQ1XSA9IDE7XHJcblRZUEVfU0laRVNbR0xfRkxPQVQkNF0gPSA0O1xyXG5UWVBFX1NJWkVTW0dMX0hBTEZfRkxPQVRfT0VTJDFdID0gMjtcclxuXHJcblRZUEVfU0laRVNbR0xfVU5TSUdORURfU0hPUlQkM10gPSAyO1xyXG5UWVBFX1NJWkVTW0dMX1VOU0lHTkVEX0lOVCQzXSA9IDQ7XHJcblxyXG52YXIgRk9STUFUX1NJWkVTX1NQRUNJQUwgPSBbXTtcclxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfUkdCQTRdID0gMjtcclxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfUkdCNV9BMV0gPSAyO1xyXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9SR0I1NjVdID0gMjtcclxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfREVQVEhfU1RFTkNJTF0gPSA0O1xyXG5cclxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JfUzNUQ19EWFQxX0VYVF0gPSAwLjU7XHJcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDFfRVhUXSA9IDAuNTtcclxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUM19FWFRdID0gMTtcclxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUNV9FWFRdID0gMTtcclxuXHJcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCX0FUQ19XRUJHTF0gPSAwLjU7XHJcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCQV9BVENfRVhQTElDSVRfQUxQSEFfV0VCR0xdID0gMTtcclxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19JTlRFUlBPTEFURURfQUxQSEFfV0VCR0xdID0gMTtcclxuXHJcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzRCUFBWMV9JTUddID0gMC41O1xyXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ18yQlBQVjFfSU1HXSA9IDAuMjU7XHJcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ180QlBQVjFfSU1HXSA9IDAuNTtcclxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzJCUFBWMV9JTUddID0gMC4yNTtcclxuXHJcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCX0VUQzFfV0VCR0xdID0gMC41O1xyXG5cclxuZnVuY3Rpb24gaXNOdW1lcmljQXJyYXkgKGFycikge1xyXG4gIHJldHVybiAoXHJcbiAgICBBcnJheS5pc0FycmF5KGFycikgJiZcclxuICAgIChhcnIubGVuZ3RoID09PSAwIHx8XHJcbiAgICB0eXBlb2YgYXJyWzBdID09PSAnbnVtYmVyJykpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzUmVjdEFycmF5IChhcnIpIHtcclxuICBpZiAoIUFycmF5LmlzQXJyYXkoYXJyKSkge1xyXG4gICAgcmV0dXJuIGZhbHNlXHJcbiAgfVxyXG4gIHZhciB3aWR0aCA9IGFyci5sZW5ndGg7XHJcbiAgaWYgKHdpZHRoID09PSAwIHx8ICFpc0FycmF5TGlrZShhcnJbMF0pKSB7XHJcbiAgICByZXR1cm4gZmFsc2VcclxuICB9XHJcbiAgcmV0dXJuIHRydWVcclxufVxyXG5cclxuZnVuY3Rpb24gY2xhc3NTdHJpbmcgKHgpIHtcclxuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHgpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzQ2FudmFzRWxlbWVudCAob2JqZWN0KSB7XHJcbiAgcmV0dXJuIGNsYXNzU3RyaW5nKG9iamVjdCkgPT09IENBTlZBU19DTEFTU1xyXG59XHJcblxyXG5mdW5jdGlvbiBpc0NvbnRleHQyRCAob2JqZWN0KSB7XHJcbiAgcmV0dXJuIGNsYXNzU3RyaW5nKG9iamVjdCkgPT09IENPTlRFWFQyRF9DTEFTU1xyXG59XHJcblxyXG5mdW5jdGlvbiBpc0JpdG1hcCAob2JqZWN0KSB7XHJcbiAgcmV0dXJuIGNsYXNzU3RyaW5nKG9iamVjdCkgPT09IEJJVE1BUF9DTEFTU1xyXG59XHJcblxyXG5mdW5jdGlvbiBpc0ltYWdlRWxlbWVudCAob2JqZWN0KSB7XHJcbiAgcmV0dXJuIGNsYXNzU3RyaW5nKG9iamVjdCkgPT09IElNQUdFX0NMQVNTXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzVmlkZW9FbGVtZW50IChvYmplY3QpIHtcclxuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gVklERU9fQ0xBU1NcclxufVxyXG5cclxuZnVuY3Rpb24gaXNQaXhlbERhdGEgKG9iamVjdCkge1xyXG4gIGlmICghb2JqZWN0KSB7XHJcbiAgICByZXR1cm4gZmFsc2VcclxuICB9XHJcbiAgdmFyIGNsYXNzTmFtZSA9IGNsYXNzU3RyaW5nKG9iamVjdCk7XHJcbiAgaWYgKFBJWEVMX0NMQVNTRVMuaW5kZXhPZihjbGFzc05hbWUpID49IDApIHtcclxuICAgIHJldHVybiB0cnVlXHJcbiAgfVxyXG4gIHJldHVybiAoXHJcbiAgICBpc051bWVyaWNBcnJheShvYmplY3QpIHx8XHJcbiAgICBpc1JlY3RBcnJheShvYmplY3QpIHx8XHJcbiAgICBpc05EQXJyYXlMaWtlKG9iamVjdCkpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHR5cGVkQXJyYXlDb2RlJDEgKGRhdGEpIHtcclxuICByZXR1cm4gYXJyYXlUeXBlc1tPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoZGF0YSldIHwgMFxyXG59XHJcblxyXG5mdW5jdGlvbiBjb252ZXJ0RGF0YSAocmVzdWx0LCBkYXRhKSB7XHJcbiAgdmFyIG4gPSBkYXRhLmxlbmd0aDtcclxuICBzd2l0Y2ggKHJlc3VsdC50eXBlKSB7XHJcbiAgICBjYXNlIEdMX1VOU0lHTkVEX0JZVEUkNTpcclxuICAgIGNhc2UgR0xfVU5TSUdORURfU0hPUlQkMzpcclxuICAgIGNhc2UgR0xfVU5TSUdORURfSU5UJDM6XHJcbiAgICBjYXNlIEdMX0ZMT0FUJDQ6XHJcbiAgICAgIHZhciBjb252ZXJ0ZWQgPSBwb29sLmFsbG9jVHlwZShyZXN1bHQudHlwZSwgbik7XHJcbiAgICAgIGNvbnZlcnRlZC5zZXQoZGF0YSk7XHJcbiAgICAgIHJlc3VsdC5kYXRhID0gY29udmVydGVkO1xyXG4gICAgICBicmVha1xyXG5cclxuICAgIGNhc2UgR0xfSEFMRl9GTE9BVF9PRVMkMTpcclxuICAgICAgcmVzdWx0LmRhdGEgPSBjb252ZXJ0VG9IYWxmRmxvYXQoZGF0YSk7XHJcbiAgICAgIGJyZWFrXHJcblxyXG4gICAgZGVmYXVsdDpcclxuICAgICAgY2hlY2skMS5yYWlzZSgndW5zdXBwb3J0ZWQgdGV4dHVyZSB0eXBlLCBtdXN0IHNwZWNpZnkgYSB0eXBlZCBhcnJheScpO1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gcHJlQ29udmVydCAoaW1hZ2UsIG4pIHtcclxuICByZXR1cm4gcG9vbC5hbGxvY1R5cGUoXHJcbiAgICBpbWFnZS50eXBlID09PSBHTF9IQUxGX0ZMT0FUX09FUyQxXHJcbiAgICAgID8gR0xfRkxPQVQkNFxyXG4gICAgICA6IGltYWdlLnR5cGUsIG4pXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHBvc3RDb252ZXJ0IChpbWFnZSwgZGF0YSkge1xyXG4gIGlmIChpbWFnZS50eXBlID09PSBHTF9IQUxGX0ZMT0FUX09FUyQxKSB7XHJcbiAgICBpbWFnZS5kYXRhID0gY29udmVydFRvSGFsZkZsb2F0KGRhdGEpO1xyXG4gICAgcG9vbC5mcmVlVHlwZShkYXRhKTtcclxuICB9IGVsc2Uge1xyXG4gICAgaW1hZ2UuZGF0YSA9IGRhdGE7XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiB0cmFuc3Bvc2VEYXRhIChpbWFnZSwgYXJyYXksIHN0cmlkZVgsIHN0cmlkZVksIHN0cmlkZUMsIG9mZnNldCkge1xyXG4gIHZhciB3ID0gaW1hZ2Uud2lkdGg7XHJcbiAgdmFyIGggPSBpbWFnZS5oZWlnaHQ7XHJcbiAgdmFyIGMgPSBpbWFnZS5jaGFubmVscztcclxuICB2YXIgbiA9IHcgKiBoICogYztcclxuICB2YXIgZGF0YSA9IHByZUNvbnZlcnQoaW1hZ2UsIG4pO1xyXG5cclxuICB2YXIgcCA9IDA7XHJcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBoOyArK2kpIHtcclxuICAgIGZvciAodmFyIGogPSAwOyBqIDwgdzsgKytqKSB7XHJcbiAgICAgIGZvciAodmFyIGsgPSAwOyBrIDwgYzsgKytrKSB7XHJcbiAgICAgICAgZGF0YVtwKytdID0gYXJyYXlbc3RyaWRlWCAqIGogKyBzdHJpZGVZICogaSArIHN0cmlkZUMgKiBrICsgb2Zmc2V0XTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcG9zdENvbnZlcnQoaW1hZ2UsIGRhdGEpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRUZXh0dXJlU2l6ZSAoZm9ybWF0LCB0eXBlLCB3aWR0aCwgaGVpZ2h0LCBpc01pcG1hcCwgaXNDdWJlKSB7XHJcbiAgdmFyIHM7XHJcbiAgaWYgKHR5cGVvZiBGT1JNQVRfU0laRVNfU1BFQ0lBTFtmb3JtYXRdICE9PSAndW5kZWZpbmVkJykge1xyXG4gICAgLy8gd2UgaGF2ZSBhIHNwZWNpYWwgYXJyYXkgZm9yIGRlYWxpbmcgd2l0aCB3ZWlyZCBjb2xvciBmb3JtYXRzIHN1Y2ggYXMgUkdCNUExXHJcbiAgICBzID0gRk9STUFUX1NJWkVTX1NQRUNJQUxbZm9ybWF0XTtcclxuICB9IGVsc2Uge1xyXG4gICAgcyA9IEZPUk1BVF9DSEFOTkVMU1tmb3JtYXRdICogVFlQRV9TSVpFU1t0eXBlXTtcclxuICB9XHJcblxyXG4gIGlmIChpc0N1YmUpIHtcclxuICAgIHMgKj0gNjtcclxuICB9XHJcblxyXG4gIGlmIChpc01pcG1hcCkge1xyXG4gICAgLy8gY29tcHV0ZSB0aGUgdG90YWwgc2l6ZSBvZiBhbGwgdGhlIG1pcG1hcHMuXHJcbiAgICB2YXIgdG90YWwgPSAwO1xyXG5cclxuICAgIHZhciB3ID0gd2lkdGg7XHJcbiAgICB3aGlsZSAodyA+PSAxKSB7XHJcbiAgICAgIC8vIHdlIGNhbiBvbmx5IHVzZSBtaXBtYXBzIG9uIGEgc3F1YXJlIGltYWdlLFxyXG4gICAgICAvLyBzbyB3ZSBjYW4gc2ltcGx5IHVzZSB0aGUgd2lkdGggYW5kIGlnbm9yZSB0aGUgaGVpZ2h0OlxyXG4gICAgICB0b3RhbCArPSBzICogdyAqIHc7XHJcbiAgICAgIHcgLz0gMjtcclxuICAgIH1cclxuICAgIHJldHVybiB0b3RhbFxyXG4gIH0gZWxzZSB7XHJcbiAgICByZXR1cm4gcyAqIHdpZHRoICogaGVpZ2h0XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVUZXh0dXJlU2V0IChcclxuICBnbCwgZXh0ZW5zaW9ucywgbGltaXRzLCByZWdsUG9sbCwgY29udGV4dFN0YXRlLCBzdGF0cywgY29uZmlnKSB7XHJcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gIC8vIEluaXRpYWxpemUgY29uc3RhbnRzIGFuZCBwYXJhbWV0ZXIgdGFibGVzIGhlcmVcclxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgdmFyIG1pcG1hcEhpbnQgPSB7XHJcbiAgICBcImRvbid0IGNhcmVcIjogR0xfRE9OVF9DQVJFLFxyXG4gICAgJ2RvbnQgY2FyZSc6IEdMX0RPTlRfQ0FSRSxcclxuICAgICduaWNlJzogR0xfTklDRVNULFxyXG4gICAgJ2Zhc3QnOiBHTF9GQVNURVNUXHJcbiAgfTtcclxuXHJcbiAgdmFyIHdyYXBNb2RlcyA9IHtcclxuICAgICdyZXBlYXQnOiBHTF9SRVBFQVQsXHJcbiAgICAnY2xhbXAnOiBHTF9DTEFNUF9UT19FREdFJDEsXHJcbiAgICAnbWlycm9yJzogR0xfTUlSUk9SRURfUkVQRUFUXHJcbiAgfTtcclxuXHJcbiAgdmFyIG1hZ0ZpbHRlcnMgPSB7XHJcbiAgICAnbmVhcmVzdCc6IEdMX05FQVJFU1QkMSxcclxuICAgICdsaW5lYXInOiBHTF9MSU5FQVJcclxuICB9O1xyXG5cclxuICB2YXIgbWluRmlsdGVycyA9IGV4dGVuZCh7XHJcbiAgICAnbWlwbWFwJzogR0xfTElORUFSX01JUE1BUF9MSU5FQVIkMSxcclxuICAgICduZWFyZXN0IG1pcG1hcCBuZWFyZXN0JzogR0xfTkVBUkVTVF9NSVBNQVBfTkVBUkVTVCQxLFxyXG4gICAgJ2xpbmVhciBtaXBtYXAgbmVhcmVzdCc6IEdMX0xJTkVBUl9NSVBNQVBfTkVBUkVTVCQxLFxyXG4gICAgJ25lYXJlc3QgbWlwbWFwIGxpbmVhcic6IEdMX05FQVJFU1RfTUlQTUFQX0xJTkVBUiQxLFxyXG4gICAgJ2xpbmVhciBtaXBtYXAgbGluZWFyJzogR0xfTElORUFSX01JUE1BUF9MSU5FQVIkMVxyXG4gIH0sIG1hZ0ZpbHRlcnMpO1xyXG5cclxuICB2YXIgY29sb3JTcGFjZSA9IHtcclxuICAgICdub25lJzogMCxcclxuICAgICdicm93c2VyJzogR0xfQlJPV1NFUl9ERUZBVUxUX1dFQkdMXHJcbiAgfTtcclxuXHJcbiAgdmFyIHRleHR1cmVUeXBlcyA9IHtcclxuICAgICd1aW50OCc6IEdMX1VOU0lHTkVEX0JZVEUkNSxcclxuICAgICdyZ2JhNCc6IEdMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzQkMSxcclxuICAgICdyZ2I1NjUnOiBHTF9VTlNJR05FRF9TSE9SVF81XzZfNSQxLFxyXG4gICAgJ3JnYjUgYTEnOiBHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xJDFcclxuICB9O1xyXG5cclxuICB2YXIgdGV4dHVyZUZvcm1hdHMgPSB7XHJcbiAgICAnYWxwaGEnOiBHTF9BTFBIQSxcclxuICAgICdsdW1pbmFuY2UnOiBHTF9MVU1JTkFOQ0UsXHJcbiAgICAnbHVtaW5hbmNlIGFscGhhJzogR0xfTFVNSU5BTkNFX0FMUEhBLFxyXG4gICAgJ3JnYic6IEdMX1JHQixcclxuICAgICdyZ2JhJzogR0xfUkdCQSQxLFxyXG4gICAgJ3JnYmE0JzogR0xfUkdCQTQsXHJcbiAgICAncmdiNSBhMSc6IEdMX1JHQjVfQTEsXHJcbiAgICAncmdiNTY1JzogR0xfUkdCNTY1XHJcbiAgfTtcclxuXHJcbiAgdmFyIGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cyA9IHt9O1xyXG5cclxuICBpZiAoZXh0ZW5zaW9ucy5leHRfc3JnYikge1xyXG4gICAgdGV4dHVyZUZvcm1hdHMuc3JnYiA9IEdMX1NSR0JfRVhUO1xyXG4gICAgdGV4dHVyZUZvcm1hdHMuc3JnYmEgPSBHTF9TUkdCX0FMUEhBX0VYVDtcclxuICB9XHJcblxyXG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2Zsb2F0KSB7XHJcbiAgICB0ZXh0dXJlVHlwZXMuZmxvYXQzMiA9IHRleHR1cmVUeXBlcy5mbG9hdCA9IEdMX0ZMT0FUJDQ7XHJcbiAgfVxyXG5cclxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9oYWxmX2Zsb2F0KSB7XHJcbiAgICB0ZXh0dXJlVHlwZXNbJ2Zsb2F0MTYnXSA9IHRleHR1cmVUeXBlc1snaGFsZiBmbG9hdCddID0gR0xfSEFMRl9GTE9BVF9PRVMkMTtcclxuICB9XHJcblxyXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2RlcHRoX3RleHR1cmUpIHtcclxuICAgIGV4dGVuZCh0ZXh0dXJlRm9ybWF0cywge1xyXG4gICAgICAnZGVwdGgnOiBHTF9ERVBUSF9DT01QT05FTlQsXHJcbiAgICAgICdkZXB0aCBzdGVuY2lsJzogR0xfREVQVEhfU1RFTkNJTFxyXG4gICAgfSk7XHJcblxyXG4gICAgZXh0ZW5kKHRleHR1cmVUeXBlcywge1xyXG4gICAgICAndWludDE2JzogR0xfVU5TSUdORURfU0hPUlQkMyxcclxuICAgICAgJ3VpbnQzMic6IEdMX1VOU0lHTkVEX0lOVCQzLFxyXG4gICAgICAnZGVwdGggc3RlbmNpbCc6IEdMX1VOU0lHTkVEX0lOVF8yNF84X1dFQkdMJDFcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX3MzdGMpIHtcclxuICAgIGV4dGVuZChjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMsIHtcclxuICAgICAgJ3JnYiBzM3RjIGR4dDEnOiBHTF9DT01QUkVTU0VEX1JHQl9TM1RDX0RYVDFfRVhULFxyXG4gICAgICAncmdiYSBzM3RjIGR4dDEnOiBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQxX0VYVCxcclxuICAgICAgJ3JnYmEgczN0YyBkeHQzJzogR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUM19FWFQsXHJcbiAgICAgICdyZ2JhIHMzdGMgZHh0NSc6IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDVfRVhUXHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9hdGMpIHtcclxuICAgIGV4dGVuZChjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMsIHtcclxuICAgICAgJ3JnYiBhdGMnOiBHTF9DT01QUkVTU0VEX1JHQl9BVENfV0VCR0wsXHJcbiAgICAgICdyZ2JhIGF0YyBleHBsaWNpdCBhbHBoYSc6IEdMX0NPTVBSRVNTRURfUkdCQV9BVENfRVhQTElDSVRfQUxQSEFfV0VCR0wsXHJcbiAgICAgICdyZ2JhIGF0YyBpbnRlcnBvbGF0ZWQgYWxwaGEnOiBHTF9DT01QUkVTU0VEX1JHQkFfQVRDX0lOVEVSUE9MQVRFRF9BTFBIQV9XRUJHTFxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfcHZydGMpIHtcclxuICAgIGV4dGVuZChjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMsIHtcclxuICAgICAgJ3JnYiBwdnJ0YyA0YnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ180QlBQVjFfSU1HLFxyXG4gICAgICAncmdiIHB2cnRjIDJicHB2MSc6IEdMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzJCUFBWMV9JTUcsXHJcbiAgICAgICdyZ2JhIHB2cnRjIDRicHB2MSc6IEdMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ180QlBQVjFfSU1HLFxyXG4gICAgICAncmdiYSBwdnJ0YyAyYnBwdjEnOiBHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfMkJQUFYxX0lNR1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfZXRjMSkge1xyXG4gICAgY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzWydyZ2IgZXRjMSddID0gR0xfQ09NUFJFU1NFRF9SR0JfRVRDMV9XRUJHTDtcclxuICB9XHJcblxyXG4gIC8vIENvcHkgb3ZlciBhbGwgdGV4dHVyZSBmb3JtYXRzXHJcbiAgdmFyIHN1cHBvcnRlZENvbXByZXNzZWRGb3JtYXRzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoXHJcbiAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfQ09NUFJFU1NFRF9URVhUVVJFX0ZPUk1BVFMpKTtcclxuICBPYmplY3Qua2V5cyhjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcclxuICAgIHZhciBmb3JtYXQgPSBjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHNbbmFtZV07XHJcbiAgICBpZiAoc3VwcG9ydGVkQ29tcHJlc3NlZEZvcm1hdHMuaW5kZXhPZihmb3JtYXQpID49IDApIHtcclxuICAgICAgdGV4dHVyZUZvcm1hdHNbbmFtZV0gPSBmb3JtYXQ7XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIHZhciBzdXBwb3J0ZWRGb3JtYXRzID0gT2JqZWN0LmtleXModGV4dHVyZUZvcm1hdHMpO1xyXG4gIGxpbWl0cy50ZXh0dXJlRm9ybWF0cyA9IHN1cHBvcnRlZEZvcm1hdHM7XHJcblxyXG4gIC8vIGFzc29jaWF0ZSB3aXRoIGV2ZXJ5IGZvcm1hdCBzdHJpbmcgaXRzXHJcbiAgLy8gY29ycmVzcG9uZGluZyBHTC12YWx1ZS5cclxuICB2YXIgdGV4dHVyZUZvcm1hdHNJbnZlcnQgPSBbXTtcclxuICBPYmplY3Qua2V5cyh0ZXh0dXJlRm9ybWF0cykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XHJcbiAgICB2YXIgdmFsID0gdGV4dHVyZUZvcm1hdHNba2V5XTtcclxuICAgIHRleHR1cmVGb3JtYXRzSW52ZXJ0W3ZhbF0gPSBrZXk7XHJcbiAgfSk7XHJcblxyXG4gIC8vIGFzc29jaWF0ZSB3aXRoIGV2ZXJ5IHR5cGUgc3RyaW5nIGl0c1xyXG4gIC8vIGNvcnJlc3BvbmRpbmcgR0wtdmFsdWUuXHJcbiAgdmFyIHRleHR1cmVUeXBlc0ludmVydCA9IFtdO1xyXG4gIE9iamVjdC5rZXlzKHRleHR1cmVUeXBlcykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XHJcbiAgICB2YXIgdmFsID0gdGV4dHVyZVR5cGVzW2tleV07XHJcbiAgICB0ZXh0dXJlVHlwZXNJbnZlcnRbdmFsXSA9IGtleTtcclxuICB9KTtcclxuXHJcbiAgdmFyIG1hZ0ZpbHRlcnNJbnZlcnQgPSBbXTtcclxuICBPYmplY3Qua2V5cyhtYWdGaWx0ZXJzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcclxuICAgIHZhciB2YWwgPSBtYWdGaWx0ZXJzW2tleV07XHJcbiAgICBtYWdGaWx0ZXJzSW52ZXJ0W3ZhbF0gPSBrZXk7XHJcbiAgfSk7XHJcblxyXG4gIHZhciBtaW5GaWx0ZXJzSW52ZXJ0ID0gW107XHJcbiAgT2JqZWN0LmtleXMobWluRmlsdGVycykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XHJcbiAgICB2YXIgdmFsID0gbWluRmlsdGVyc1trZXldO1xyXG4gICAgbWluRmlsdGVyc0ludmVydFt2YWxdID0ga2V5O1xyXG4gIH0pO1xyXG5cclxuICB2YXIgd3JhcE1vZGVzSW52ZXJ0ID0gW107XHJcbiAgT2JqZWN0LmtleXMod3JhcE1vZGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcclxuICAgIHZhciB2YWwgPSB3cmFwTW9kZXNba2V5XTtcclxuICAgIHdyYXBNb2Rlc0ludmVydFt2YWxdID0ga2V5O1xyXG4gIH0pO1xyXG5cclxuICAvLyBjb2xvckZvcm1hdHNbXSBnaXZlcyB0aGUgZm9ybWF0IChjaGFubmVscykgYXNzb2NpYXRlZCB0byBhblxyXG4gIC8vIGludGVybmFsZm9ybWF0XHJcbiAgdmFyIGNvbG9yRm9ybWF0cyA9IHN1cHBvcnRlZEZvcm1hdHMucmVkdWNlKGZ1bmN0aW9uIChjb2xvciwga2V5KSB7XHJcbiAgICB2YXIgZ2xlbnVtID0gdGV4dHVyZUZvcm1hdHNba2V5XTtcclxuICAgIGlmIChnbGVudW0gPT09IEdMX0xVTUlOQU5DRSB8fFxyXG4gICAgICAgIGdsZW51bSA9PT0gR0xfQUxQSEEgfHxcclxuICAgICAgICBnbGVudW0gPT09IEdMX0xVTUlOQU5DRSB8fFxyXG4gICAgICAgIGdsZW51bSA9PT0gR0xfTFVNSU5BTkNFX0FMUEhBIHx8XHJcbiAgICAgICAgZ2xlbnVtID09PSBHTF9ERVBUSF9DT01QT05FTlQgfHxcclxuICAgICAgICBnbGVudW0gPT09IEdMX0RFUFRIX1NURU5DSUwpIHtcclxuICAgICAgY29sb3JbZ2xlbnVtXSA9IGdsZW51bTtcclxuICAgIH0gZWxzZSBpZiAoZ2xlbnVtID09PSBHTF9SR0I1X0ExIHx8IGtleS5pbmRleE9mKCdyZ2JhJykgPj0gMCkge1xyXG4gICAgICBjb2xvcltnbGVudW1dID0gR0xfUkdCQSQxO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY29sb3JbZ2xlbnVtXSA9IEdMX1JHQjtcclxuICAgIH1cclxuICAgIHJldHVybiBjb2xvclxyXG4gIH0sIHt9KTtcclxuXHJcbiAgZnVuY3Rpb24gVGV4RmxhZ3MgKCkge1xyXG4gICAgLy8gZm9ybWF0IGluZm9cclxuICAgIHRoaXMuaW50ZXJuYWxmb3JtYXQgPSBHTF9SR0JBJDE7XHJcbiAgICB0aGlzLmZvcm1hdCA9IEdMX1JHQkEkMTtcclxuICAgIHRoaXMudHlwZSA9IEdMX1VOU0lHTkVEX0JZVEUkNTtcclxuICAgIHRoaXMuY29tcHJlc3NlZCA9IGZhbHNlO1xyXG5cclxuICAgIC8vIHBpeGVsIHN0b3JhZ2VcclxuICAgIHRoaXMucHJlbXVsdGlwbHlBbHBoYSA9IGZhbHNlO1xyXG4gICAgdGhpcy5mbGlwWSA9IGZhbHNlO1xyXG4gICAgdGhpcy51bnBhY2tBbGlnbm1lbnQgPSAxO1xyXG4gICAgdGhpcy5jb2xvclNwYWNlID0gR0xfQlJPV1NFUl9ERUZBVUxUX1dFQkdMO1xyXG5cclxuICAgIC8vIHNoYXBlIGluZm9cclxuICAgIHRoaXMud2lkdGggPSAwO1xyXG4gICAgdGhpcy5oZWlnaHQgPSAwO1xyXG4gICAgdGhpcy5jaGFubmVscyA9IDA7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBjb3B5RmxhZ3MgKHJlc3VsdCwgb3RoZXIpIHtcclxuICAgIHJlc3VsdC5pbnRlcm5hbGZvcm1hdCA9IG90aGVyLmludGVybmFsZm9ybWF0O1xyXG4gICAgcmVzdWx0LmZvcm1hdCA9IG90aGVyLmZvcm1hdDtcclxuICAgIHJlc3VsdC50eXBlID0gb3RoZXIudHlwZTtcclxuICAgIHJlc3VsdC5jb21wcmVzc2VkID0gb3RoZXIuY29tcHJlc3NlZDtcclxuXHJcbiAgICByZXN1bHQucHJlbXVsdGlwbHlBbHBoYSA9IG90aGVyLnByZW11bHRpcGx5QWxwaGE7XHJcbiAgICByZXN1bHQuZmxpcFkgPSBvdGhlci5mbGlwWTtcclxuICAgIHJlc3VsdC51bnBhY2tBbGlnbm1lbnQgPSBvdGhlci51bnBhY2tBbGlnbm1lbnQ7XHJcbiAgICByZXN1bHQuY29sb3JTcGFjZSA9IG90aGVyLmNvbG9yU3BhY2U7XHJcblxyXG4gICAgcmVzdWx0LndpZHRoID0gb3RoZXIud2lkdGg7XHJcbiAgICByZXN1bHQuaGVpZ2h0ID0gb3RoZXIuaGVpZ2h0O1xyXG4gICAgcmVzdWx0LmNoYW5uZWxzID0gb3RoZXIuY2hhbm5lbHM7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBwYXJzZUZsYWdzIChmbGFncywgb3B0aW9ucykge1xyXG4gICAgaWYgKHR5cGVvZiBvcHRpb25zICE9PSAnb2JqZWN0JyB8fCAhb3B0aW9ucykge1xyXG4gICAgICByZXR1cm5cclxuICAgIH1cclxuXHJcbiAgICBpZiAoJ3ByZW11bHRpcGx5QWxwaGEnIGluIG9wdGlvbnMpIHtcclxuICAgICAgY2hlY2skMS50eXBlKG9wdGlvbnMucHJlbXVsdGlwbHlBbHBoYSwgJ2Jvb2xlYW4nLFxyXG4gICAgICAgICdpbnZhbGlkIHByZW11bHRpcGx5QWxwaGEnKTtcclxuICAgICAgZmxhZ3MucHJlbXVsdGlwbHlBbHBoYSA9IG9wdGlvbnMucHJlbXVsdGlwbHlBbHBoYTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoJ2ZsaXBZJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgIGNoZWNrJDEudHlwZShvcHRpb25zLmZsaXBZLCAnYm9vbGVhbicsXHJcbiAgICAgICAgJ2ludmFsaWQgdGV4dHVyZSBmbGlwJyk7XHJcbiAgICAgIGZsYWdzLmZsaXBZID0gb3B0aW9ucy5mbGlwWTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoJ2FsaWdubWVudCcgaW4gb3B0aW9ucykge1xyXG4gICAgICBjaGVjayQxLm9uZU9mKG9wdGlvbnMuYWxpZ25tZW50LCBbMSwgMiwgNCwgOF0sXHJcbiAgICAgICAgJ2ludmFsaWQgdGV4dHVyZSB1bnBhY2sgYWxpZ25tZW50Jyk7XHJcbiAgICAgIGZsYWdzLnVucGFja0FsaWdubWVudCA9IG9wdGlvbnMuYWxpZ25tZW50O1xyXG4gICAgfVxyXG5cclxuICAgIGlmICgnY29sb3JTcGFjZScgaW4gb3B0aW9ucykge1xyXG4gICAgICBjaGVjayQxLnBhcmFtZXRlcihvcHRpb25zLmNvbG9yU3BhY2UsIGNvbG9yU3BhY2UsXHJcbiAgICAgICAgJ2ludmFsaWQgY29sb3JTcGFjZScpO1xyXG4gICAgICBmbGFncy5jb2xvclNwYWNlID0gY29sb3JTcGFjZVtvcHRpb25zLmNvbG9yU3BhY2VdO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICgndHlwZScgaW4gb3B0aW9ucykge1xyXG4gICAgICB2YXIgdHlwZSA9IG9wdGlvbnMudHlwZTtcclxuICAgICAgY2hlY2skMShleHRlbnNpb25zLm9lc190ZXh0dXJlX2Zsb2F0IHx8XHJcbiAgICAgICAgISh0eXBlID09PSAnZmxvYXQnIHx8IHR5cGUgPT09ICdmbG9hdDMyJyksXHJcbiAgICAgICAgJ3lvdSBtdXN0IGVuYWJsZSB0aGUgT0VTX3RleHR1cmVfZmxvYXQgZXh0ZW5zaW9uIGluIG9yZGVyIHRvIHVzZSBmbG9hdGluZyBwb2ludCB0ZXh0dXJlcy4nKTtcclxuICAgICAgY2hlY2skMShleHRlbnNpb25zLm9lc190ZXh0dXJlX2hhbGZfZmxvYXQgfHxcclxuICAgICAgICAhKHR5cGUgPT09ICdoYWxmIGZsb2F0JyB8fCB0eXBlID09PSAnZmxvYXQxNicpLFxyXG4gICAgICAgICd5b3UgbXVzdCBlbmFibGUgdGhlIE9FU190ZXh0dXJlX2hhbGZfZmxvYXQgZXh0ZW5zaW9uIGluIG9yZGVyIHRvIHVzZSAxNi1iaXQgZmxvYXRpbmcgcG9pbnQgdGV4dHVyZXMuJyk7XHJcbiAgICAgIGNoZWNrJDEoZXh0ZW5zaW9ucy53ZWJnbF9kZXB0aF90ZXh0dXJlIHx8XHJcbiAgICAgICAgISh0eXBlID09PSAndWludDE2JyB8fCB0eXBlID09PSAndWludDMyJyB8fCB0eXBlID09PSAnZGVwdGggc3RlbmNpbCcpLFxyXG4gICAgICAgICd5b3UgbXVzdCBlbmFibGUgdGhlIFdFQkdMX2RlcHRoX3RleHR1cmUgZXh0ZW5zaW9uIGluIG9yZGVyIHRvIHVzZSBkZXB0aC9zdGVuY2lsIHRleHR1cmVzLicpO1xyXG4gICAgICBjaGVjayQxLnBhcmFtZXRlcih0eXBlLCB0ZXh0dXJlVHlwZXMsXHJcbiAgICAgICAgJ2ludmFsaWQgdGV4dHVyZSB0eXBlJyk7XHJcbiAgICAgIGZsYWdzLnR5cGUgPSB0ZXh0dXJlVHlwZXNbdHlwZV07XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIHcgPSBmbGFncy53aWR0aDtcclxuICAgIHZhciBoID0gZmxhZ3MuaGVpZ2h0O1xyXG4gICAgdmFyIGMgPSBmbGFncy5jaGFubmVscztcclxuICAgIHZhciBoYXNDaGFubmVscyA9IGZhbHNlO1xyXG4gICAgaWYgKCdzaGFwZScgaW4gb3B0aW9ucykge1xyXG4gICAgICBjaGVjayQxKEFycmF5LmlzQXJyYXkob3B0aW9ucy5zaGFwZSkgJiYgb3B0aW9ucy5zaGFwZS5sZW5ndGggPj0gMixcclxuICAgICAgICAnc2hhcGUgbXVzdCBiZSBhbiBhcnJheScpO1xyXG4gICAgICB3ID0gb3B0aW9ucy5zaGFwZVswXTtcclxuICAgICAgaCA9IG9wdGlvbnMuc2hhcGVbMV07XHJcbiAgICAgIGlmIChvcHRpb25zLnNoYXBlLmxlbmd0aCA9PT0gMykge1xyXG4gICAgICAgIGMgPSBvcHRpb25zLnNoYXBlWzJdO1xyXG4gICAgICAgIGNoZWNrJDEoYyA+IDAgJiYgYyA8PSA0LCAnaW52YWxpZCBudW1iZXIgb2YgY2hhbm5lbHMnKTtcclxuICAgICAgICBoYXNDaGFubmVscyA9IHRydWU7XHJcbiAgICAgIH1cclxuICAgICAgY2hlY2skMSh3ID49IDAgJiYgdyA8PSBsaW1pdHMubWF4VGV4dHVyZVNpemUsICdpbnZhbGlkIHdpZHRoJyk7XHJcbiAgICAgIGNoZWNrJDEoaCA+PSAwICYmIGggPD0gbGltaXRzLm1heFRleHR1cmVTaXplLCAnaW52YWxpZCBoZWlnaHQnKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGlmICgncmFkaXVzJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgdyA9IGggPSBvcHRpb25zLnJhZGl1cztcclxuICAgICAgICBjaGVjayQxKHcgPj0gMCAmJiB3IDw9IGxpbWl0cy5tYXhUZXh0dXJlU2l6ZSwgJ2ludmFsaWQgcmFkaXVzJyk7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKCd3aWR0aCcgaW4gb3B0aW9ucykge1xyXG4gICAgICAgIHcgPSBvcHRpb25zLndpZHRoO1xyXG4gICAgICAgIGNoZWNrJDEodyA+PSAwICYmIHcgPD0gbGltaXRzLm1heFRleHR1cmVTaXplLCAnaW52YWxpZCB3aWR0aCcpO1xyXG4gICAgICB9XHJcbiAgICAgIGlmICgnaGVpZ2h0JyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgaCA9IG9wdGlvbnMuaGVpZ2h0O1xyXG4gICAgICAgIGNoZWNrJDEoaCA+PSAwICYmIGggPD0gbGltaXRzLm1heFRleHR1cmVTaXplLCAnaW52YWxpZCBoZWlnaHQnKTtcclxuICAgICAgfVxyXG4gICAgICBpZiAoJ2NoYW5uZWxzJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgYyA9IG9wdGlvbnMuY2hhbm5lbHM7XHJcbiAgICAgICAgY2hlY2skMShjID4gMCAmJiBjIDw9IDQsICdpbnZhbGlkIG51bWJlciBvZiBjaGFubmVscycpO1xyXG4gICAgICAgIGhhc0NoYW5uZWxzID0gdHJ1ZTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgZmxhZ3Mud2lkdGggPSB3IHwgMDtcclxuICAgIGZsYWdzLmhlaWdodCA9IGggfCAwO1xyXG4gICAgZmxhZ3MuY2hhbm5lbHMgPSBjIHwgMDtcclxuXHJcbiAgICB2YXIgaGFzRm9ybWF0ID0gZmFsc2U7XHJcbiAgICBpZiAoJ2Zvcm1hdCcgaW4gb3B0aW9ucykge1xyXG4gICAgICB2YXIgZm9ybWF0U3RyID0gb3B0aW9ucy5mb3JtYXQ7XHJcbiAgICAgIGNoZWNrJDEoZXh0ZW5zaW9ucy53ZWJnbF9kZXB0aF90ZXh0dXJlIHx8XHJcbiAgICAgICAgIShmb3JtYXRTdHIgPT09ICdkZXB0aCcgfHwgZm9ybWF0U3RyID09PSAnZGVwdGggc3RlbmNpbCcpLFxyXG4gICAgICAgICd5b3UgbXVzdCBlbmFibGUgdGhlIFdFQkdMX2RlcHRoX3RleHR1cmUgZXh0ZW5zaW9uIGluIG9yZGVyIHRvIHVzZSBkZXB0aC9zdGVuY2lsIHRleHR1cmVzLicpO1xyXG4gICAgICBjaGVjayQxLnBhcmFtZXRlcihmb3JtYXRTdHIsIHRleHR1cmVGb3JtYXRzLFxyXG4gICAgICAgICdpbnZhbGlkIHRleHR1cmUgZm9ybWF0Jyk7XHJcbiAgICAgIHZhciBpbnRlcm5hbGZvcm1hdCA9IGZsYWdzLmludGVybmFsZm9ybWF0ID0gdGV4dHVyZUZvcm1hdHNbZm9ybWF0U3RyXTtcclxuICAgICAgZmxhZ3MuZm9ybWF0ID0gY29sb3JGb3JtYXRzW2ludGVybmFsZm9ybWF0XTtcclxuICAgICAgaWYgKGZvcm1hdFN0ciBpbiB0ZXh0dXJlVHlwZXMpIHtcclxuICAgICAgICBpZiAoISgndHlwZScgaW4gb3B0aW9ucykpIHtcclxuICAgICAgICAgIGZsYWdzLnR5cGUgPSB0ZXh0dXJlVHlwZXNbZm9ybWF0U3RyXTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgaWYgKGZvcm1hdFN0ciBpbiBjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHMpIHtcclxuICAgICAgICBmbGFncy5jb21wcmVzc2VkID0gdHJ1ZTtcclxuICAgICAgfVxyXG4gICAgICBoYXNGb3JtYXQgPSB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFJlY29uY2lsZSBjaGFubmVscyBhbmQgZm9ybWF0XHJcbiAgICBpZiAoIWhhc0NoYW5uZWxzICYmIGhhc0Zvcm1hdCkge1xyXG4gICAgICBmbGFncy5jaGFubmVscyA9IEZPUk1BVF9DSEFOTkVMU1tmbGFncy5mb3JtYXRdO1xyXG4gICAgfSBlbHNlIGlmIChoYXNDaGFubmVscyAmJiAhaGFzRm9ybWF0KSB7XHJcbiAgICAgIGlmIChmbGFncy5jaGFubmVscyAhPT0gQ0hBTk5FTFNfRk9STUFUW2ZsYWdzLmZvcm1hdF0pIHtcclxuICAgICAgICBmbGFncy5mb3JtYXQgPSBmbGFncy5pbnRlcm5hbGZvcm1hdCA9IENIQU5ORUxTX0ZPUk1BVFtmbGFncy5jaGFubmVsc107XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSBpZiAoaGFzRm9ybWF0ICYmIGhhc0NoYW5uZWxzKSB7XHJcbiAgICAgIGNoZWNrJDEoXHJcbiAgICAgICAgZmxhZ3MuY2hhbm5lbHMgPT09IEZPUk1BVF9DSEFOTkVMU1tmbGFncy5mb3JtYXRdLFxyXG4gICAgICAgICdudW1iZXIgb2YgY2hhbm5lbHMgaW5jb25zaXN0ZW50IHdpdGggc3BlY2lmaWVkIGZvcm1hdCcpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gc2V0RmxhZ3MgKGZsYWdzKSB7XHJcbiAgICBnbC5waXhlbFN0b3JlaShHTF9VTlBBQ0tfRkxJUF9ZX1dFQkdMLCBmbGFncy5mbGlwWSk7XHJcbiAgICBnbC5waXhlbFN0b3JlaShHTF9VTlBBQ0tfUFJFTVVMVElQTFlfQUxQSEFfV0VCR0wsIGZsYWdzLnByZW11bHRpcGx5QWxwaGEpO1xyXG4gICAgZ2wucGl4ZWxTdG9yZWkoR0xfVU5QQUNLX0NPTE9SU1BBQ0VfQ09OVkVSU0lPTl9XRUJHTCwgZmxhZ3MuY29sb3JTcGFjZSk7XHJcbiAgICBnbC5waXhlbFN0b3JlaShHTF9VTlBBQ0tfQUxJR05NRU5ULCBmbGFncy51bnBhY2tBbGlnbm1lbnQpO1xyXG4gIH1cclxuXHJcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gIC8vIFRleCBpbWFnZSBkYXRhXHJcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gIGZ1bmN0aW9uIFRleEltYWdlICgpIHtcclxuICAgIFRleEZsYWdzLmNhbGwodGhpcyk7XHJcblxyXG4gICAgdGhpcy54T2Zmc2V0ID0gMDtcclxuICAgIHRoaXMueU9mZnNldCA9IDA7XHJcblxyXG4gICAgLy8gZGF0YVxyXG4gICAgdGhpcy5kYXRhID0gbnVsbDtcclxuICAgIHRoaXMubmVlZHNGcmVlID0gZmFsc2U7XHJcblxyXG4gICAgLy8gaHRtbCBlbGVtZW50XHJcbiAgICB0aGlzLmVsZW1lbnQgPSBudWxsO1xyXG5cclxuICAgIC8vIGNvcHlUZXhJbWFnZSBpbmZvXHJcbiAgICB0aGlzLm5lZWRzQ29weSA9IGZhbHNlO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gcGFyc2VJbWFnZSAoaW1hZ2UsIG9wdGlvbnMpIHtcclxuICAgIHZhciBkYXRhID0gbnVsbDtcclxuICAgIGlmIChpc1BpeGVsRGF0YShvcHRpb25zKSkge1xyXG4gICAgICBkYXRhID0gb3B0aW9ucztcclxuICAgIH0gZWxzZSBpZiAob3B0aW9ucykge1xyXG4gICAgICBjaGVjayQxLnR5cGUob3B0aW9ucywgJ29iamVjdCcsICdpbnZhbGlkIHBpeGVsIGRhdGEgdHlwZScpO1xyXG4gICAgICBwYXJzZUZsYWdzKGltYWdlLCBvcHRpb25zKTtcclxuICAgICAgaWYgKCd4JyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgaW1hZ2UueE9mZnNldCA9IG9wdGlvbnMueCB8IDA7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKCd5JyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgaW1hZ2UueU9mZnNldCA9IG9wdGlvbnMueSB8IDA7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKGlzUGl4ZWxEYXRhKG9wdGlvbnMuZGF0YSkpIHtcclxuICAgICAgICBkYXRhID0gb3B0aW9ucy5kYXRhO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgY2hlY2skMShcclxuICAgICAgIWltYWdlLmNvbXByZXNzZWQgfHxcclxuICAgICAgZGF0YSBpbnN0YW5jZW9mIFVpbnQ4QXJyYXksXHJcbiAgICAgICdjb21wcmVzc2VkIHRleHR1cmUgZGF0YSBtdXN0IGJlIHN0b3JlZCBpbiBhIHVpbnQ4YXJyYXknKTtcclxuXHJcbiAgICBpZiAob3B0aW9ucy5jb3B5KSB7XHJcbiAgICAgIGNoZWNrJDEoIWRhdGEsICdjYW4gbm90IHNwZWNpZnkgY29weSBhbmQgZGF0YSBmaWVsZCBmb3IgdGhlIHNhbWUgdGV4dHVyZScpO1xyXG4gICAgICB2YXIgdmlld1cgPSBjb250ZXh0U3RhdGUudmlld3BvcnRXaWR0aDtcclxuICAgICAgdmFyIHZpZXdIID0gY29udGV4dFN0YXRlLnZpZXdwb3J0SGVpZ2h0O1xyXG4gICAgICBpbWFnZS53aWR0aCA9IGltYWdlLndpZHRoIHx8ICh2aWV3VyAtIGltYWdlLnhPZmZzZXQpO1xyXG4gICAgICBpbWFnZS5oZWlnaHQgPSBpbWFnZS5oZWlnaHQgfHwgKHZpZXdIIC0gaW1hZ2UueU9mZnNldCk7XHJcbiAgICAgIGltYWdlLm5lZWRzQ29weSA9IHRydWU7XHJcbiAgICAgIGNoZWNrJDEoaW1hZ2UueE9mZnNldCA+PSAwICYmIGltYWdlLnhPZmZzZXQgPCB2aWV3VyAmJlxyXG4gICAgICAgICAgICBpbWFnZS55T2Zmc2V0ID49IDAgJiYgaW1hZ2UueU9mZnNldCA8IHZpZXdIICYmXHJcbiAgICAgICAgICAgIGltYWdlLndpZHRoID4gMCAmJiBpbWFnZS53aWR0aCA8PSB2aWV3VyAmJlxyXG4gICAgICAgICAgICBpbWFnZS5oZWlnaHQgPiAwICYmIGltYWdlLmhlaWdodCA8PSB2aWV3SCxcclxuICAgICAgICAgICAgJ2NvcHkgdGV4dHVyZSByZWFkIG91dCBvZiBib3VuZHMnKTtcclxuICAgIH0gZWxzZSBpZiAoIWRhdGEpIHtcclxuICAgICAgaW1hZ2Uud2lkdGggPSBpbWFnZS53aWR0aCB8fCAxO1xyXG4gICAgICBpbWFnZS5oZWlnaHQgPSBpbWFnZS5oZWlnaHQgfHwgMTtcclxuICAgICAgaW1hZ2UuY2hhbm5lbHMgPSBpbWFnZS5jaGFubmVscyB8fCA0O1xyXG4gICAgfSBlbHNlIGlmIChpc1R5cGVkQXJyYXkoZGF0YSkpIHtcclxuICAgICAgaW1hZ2UuY2hhbm5lbHMgPSBpbWFnZS5jaGFubmVscyB8fCA0O1xyXG4gICAgICBpbWFnZS5kYXRhID0gZGF0YTtcclxuICAgICAgaWYgKCEoJ3R5cGUnIGluIG9wdGlvbnMpICYmIGltYWdlLnR5cGUgPT09IEdMX1VOU0lHTkVEX0JZVEUkNSkge1xyXG4gICAgICAgIGltYWdlLnR5cGUgPSB0eXBlZEFycmF5Q29kZSQxKGRhdGEpO1xyXG4gICAgICB9XHJcbiAgICB9IGVsc2UgaWYgKGlzTnVtZXJpY0FycmF5KGRhdGEpKSB7XHJcbiAgICAgIGltYWdlLmNoYW5uZWxzID0gaW1hZ2UuY2hhbm5lbHMgfHwgNDtcclxuICAgICAgY29udmVydERhdGEoaW1hZ2UsIGRhdGEpO1xyXG4gICAgICBpbWFnZS5hbGlnbm1lbnQgPSAxO1xyXG4gICAgICBpbWFnZS5uZWVkc0ZyZWUgPSB0cnVlO1xyXG4gICAgfSBlbHNlIGlmIChpc05EQXJyYXlMaWtlKGRhdGEpKSB7XHJcbiAgICAgIHZhciBhcnJheSA9IGRhdGEuZGF0YTtcclxuICAgICAgaWYgKCFBcnJheS5pc0FycmF5KGFycmF5KSAmJiBpbWFnZS50eXBlID09PSBHTF9VTlNJR05FRF9CWVRFJDUpIHtcclxuICAgICAgICBpbWFnZS50eXBlID0gdHlwZWRBcnJheUNvZGUkMShhcnJheSk7XHJcbiAgICAgIH1cclxuICAgICAgdmFyIHNoYXBlID0gZGF0YS5zaGFwZTtcclxuICAgICAgdmFyIHN0cmlkZSA9IGRhdGEuc3RyaWRlO1xyXG4gICAgICB2YXIgc2hhcGVYLCBzaGFwZVksIHNoYXBlQywgc3RyaWRlWCwgc3RyaWRlWSwgc3RyaWRlQztcclxuICAgICAgaWYgKHNoYXBlLmxlbmd0aCA9PT0gMykge1xyXG4gICAgICAgIHNoYXBlQyA9IHNoYXBlWzJdO1xyXG4gICAgICAgIHN0cmlkZUMgPSBzdHJpZGVbMl07XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgY2hlY2skMShzaGFwZS5sZW5ndGggPT09IDIsICdpbnZhbGlkIG5kYXJyYXkgcGl4ZWwgZGF0YSwgbXVzdCBiZSAyIG9yIDNEJyk7XHJcbiAgICAgICAgc2hhcGVDID0gMTtcclxuICAgICAgICBzdHJpZGVDID0gMTtcclxuICAgICAgfVxyXG4gICAgICBzaGFwZVggPSBzaGFwZVswXTtcclxuICAgICAgc2hhcGVZID0gc2hhcGVbMV07XHJcbiAgICAgIHN0cmlkZVggPSBzdHJpZGVbMF07XHJcbiAgICAgIHN0cmlkZVkgPSBzdHJpZGVbMV07XHJcbiAgICAgIGltYWdlLmFsaWdubWVudCA9IDE7XHJcbiAgICAgIGltYWdlLndpZHRoID0gc2hhcGVYO1xyXG4gICAgICBpbWFnZS5oZWlnaHQgPSBzaGFwZVk7XHJcbiAgICAgIGltYWdlLmNoYW5uZWxzID0gc2hhcGVDO1xyXG4gICAgICBpbWFnZS5mb3JtYXQgPSBpbWFnZS5pbnRlcm5hbGZvcm1hdCA9IENIQU5ORUxTX0ZPUk1BVFtzaGFwZUNdO1xyXG4gICAgICBpbWFnZS5uZWVkc0ZyZWUgPSB0cnVlO1xyXG4gICAgICB0cmFuc3Bvc2VEYXRhKGltYWdlLCBhcnJheSwgc3RyaWRlWCwgc3RyaWRlWSwgc3RyaWRlQywgZGF0YS5vZmZzZXQpO1xyXG4gICAgfSBlbHNlIGlmIChpc0NhbnZhc0VsZW1lbnQoZGF0YSkgfHwgaXNDb250ZXh0MkQoZGF0YSkpIHtcclxuICAgICAgaWYgKGlzQ2FudmFzRWxlbWVudChkYXRhKSkge1xyXG4gICAgICAgIGltYWdlLmVsZW1lbnQgPSBkYXRhO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGltYWdlLmVsZW1lbnQgPSBkYXRhLmNhbnZhcztcclxuICAgICAgfVxyXG4gICAgICBpbWFnZS53aWR0aCA9IGltYWdlLmVsZW1lbnQud2lkdGg7XHJcbiAgICAgIGltYWdlLmhlaWdodCA9IGltYWdlLmVsZW1lbnQuaGVpZ2h0O1xyXG4gICAgICBpbWFnZS5jaGFubmVscyA9IDQ7XHJcbiAgICB9IGVsc2UgaWYgKGlzQml0bWFwKGRhdGEpKSB7XHJcbiAgICAgIGltYWdlLmVsZW1lbnQgPSBkYXRhO1xyXG4gICAgICBpbWFnZS53aWR0aCA9IGRhdGEud2lkdGg7XHJcbiAgICAgIGltYWdlLmhlaWdodCA9IGRhdGEuaGVpZ2h0O1xyXG4gICAgICBpbWFnZS5jaGFubmVscyA9IDQ7XHJcbiAgICB9IGVsc2UgaWYgKGlzSW1hZ2VFbGVtZW50KGRhdGEpKSB7XHJcbiAgICAgIGltYWdlLmVsZW1lbnQgPSBkYXRhO1xyXG4gICAgICBpbWFnZS53aWR0aCA9IGRhdGEubmF0dXJhbFdpZHRoO1xyXG4gICAgICBpbWFnZS5oZWlnaHQgPSBkYXRhLm5hdHVyYWxIZWlnaHQ7XHJcbiAgICAgIGltYWdlLmNoYW5uZWxzID0gNDtcclxuICAgIH0gZWxzZSBpZiAoaXNWaWRlb0VsZW1lbnQoZGF0YSkpIHtcclxuICAgICAgaW1hZ2UuZWxlbWVudCA9IGRhdGE7XHJcbiAgICAgIGltYWdlLndpZHRoID0gZGF0YS52aWRlb1dpZHRoO1xyXG4gICAgICBpbWFnZS5oZWlnaHQgPSBkYXRhLnZpZGVvSGVpZ2h0O1xyXG4gICAgICBpbWFnZS5jaGFubmVscyA9IDQ7XHJcbiAgICB9IGVsc2UgaWYgKGlzUmVjdEFycmF5KGRhdGEpKSB7XHJcbiAgICAgIHZhciB3ID0gaW1hZ2Uud2lkdGggfHwgZGF0YVswXS5sZW5ndGg7XHJcbiAgICAgIHZhciBoID0gaW1hZ2UuaGVpZ2h0IHx8IGRhdGEubGVuZ3RoO1xyXG4gICAgICB2YXIgYyA9IGltYWdlLmNoYW5uZWxzO1xyXG4gICAgICBpZiAoaXNBcnJheUxpa2UoZGF0YVswXVswXSkpIHtcclxuICAgICAgICBjID0gYyB8fCBkYXRhWzBdWzBdLmxlbmd0aDtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBjID0gYyB8fCAxO1xyXG4gICAgICB9XHJcbiAgICAgIHZhciBhcnJheVNoYXBlID0gZmxhdHRlblV0aWxzLnNoYXBlKGRhdGEpO1xyXG4gICAgICB2YXIgbiA9IDE7XHJcbiAgICAgIGZvciAodmFyIGRkID0gMDsgZGQgPCBhcnJheVNoYXBlLmxlbmd0aDsgKytkZCkge1xyXG4gICAgICAgIG4gKj0gYXJyYXlTaGFwZVtkZF07XHJcbiAgICAgIH1cclxuICAgICAgdmFyIGFsbG9jRGF0YSA9IHByZUNvbnZlcnQoaW1hZ2UsIG4pO1xyXG4gICAgICBmbGF0dGVuVXRpbHMuZmxhdHRlbihkYXRhLCBhcnJheVNoYXBlLCAnJywgYWxsb2NEYXRhKTtcclxuICAgICAgcG9zdENvbnZlcnQoaW1hZ2UsIGFsbG9jRGF0YSk7XHJcbiAgICAgIGltYWdlLmFsaWdubWVudCA9IDE7XHJcbiAgICAgIGltYWdlLndpZHRoID0gdztcclxuICAgICAgaW1hZ2UuaGVpZ2h0ID0gaDtcclxuICAgICAgaW1hZ2UuY2hhbm5lbHMgPSBjO1xyXG4gICAgICBpbWFnZS5mb3JtYXQgPSBpbWFnZS5pbnRlcm5hbGZvcm1hdCA9IENIQU5ORUxTX0ZPUk1BVFtjXTtcclxuICAgICAgaW1hZ2UubmVlZHNGcmVlID0gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoaW1hZ2UudHlwZSA9PT0gR0xfRkxPQVQkNCkge1xyXG4gICAgICBjaGVjayQxKGxpbWl0cy5leHRlbnNpb25zLmluZGV4T2YoJ29lc190ZXh0dXJlX2Zsb2F0JykgPj0gMCxcclxuICAgICAgICAnb2VzX3RleHR1cmVfZmxvYXQgZXh0ZW5zaW9uIG5vdCBlbmFibGVkJyk7XHJcbiAgICB9IGVsc2UgaWYgKGltYWdlLnR5cGUgPT09IEdMX0hBTEZfRkxPQVRfT0VTJDEpIHtcclxuICAgICAgY2hlY2skMShsaW1pdHMuZXh0ZW5zaW9ucy5pbmRleE9mKCdvZXNfdGV4dHVyZV9oYWxmX2Zsb2F0JykgPj0gMCxcclxuICAgICAgICAnb2VzX3RleHR1cmVfaGFsZl9mbG9hdCBleHRlbnNpb24gbm90IGVuYWJsZWQnKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBkbyBjb21wcmVzc2VkIHRleHR1cmUgIHZhbGlkYXRpb24gaGVyZS5cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHNldEltYWdlIChpbmZvLCB0YXJnZXQsIG1pcGxldmVsKSB7XHJcbiAgICB2YXIgZWxlbWVudCA9IGluZm8uZWxlbWVudDtcclxuICAgIHZhciBkYXRhID0gaW5mby5kYXRhO1xyXG4gICAgdmFyIGludGVybmFsZm9ybWF0ID0gaW5mby5pbnRlcm5hbGZvcm1hdDtcclxuICAgIHZhciBmb3JtYXQgPSBpbmZvLmZvcm1hdDtcclxuICAgIHZhciB0eXBlID0gaW5mby50eXBlO1xyXG4gICAgdmFyIHdpZHRoID0gaW5mby53aWR0aDtcclxuICAgIHZhciBoZWlnaHQgPSBpbmZvLmhlaWdodDtcclxuICAgIHZhciBjaGFubmVscyA9IGluZm8uY2hhbm5lbHM7XHJcblxyXG4gICAgc2V0RmxhZ3MoaW5mbyk7XHJcblxyXG4gICAgaWYgKGVsZW1lbnQpIHtcclxuICAgICAgZ2wudGV4SW1hZ2UyRCh0YXJnZXQsIG1pcGxldmVsLCBmb3JtYXQsIGZvcm1hdCwgdHlwZSwgZWxlbWVudCk7XHJcbiAgICB9IGVsc2UgaWYgKGluZm8uY29tcHJlc3NlZCkge1xyXG4gICAgICBnbC5jb21wcmVzc2VkVGV4SW1hZ2UyRCh0YXJnZXQsIG1pcGxldmVsLCBpbnRlcm5hbGZvcm1hdCwgd2lkdGgsIGhlaWdodCwgMCwgZGF0YSk7XHJcbiAgICB9IGVsc2UgaWYgKGluZm8ubmVlZHNDb3B5KSB7XHJcbiAgICAgIHJlZ2xQb2xsKCk7XHJcbiAgICAgIGdsLmNvcHlUZXhJbWFnZTJEKFxyXG4gICAgICAgIHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgaW5mby54T2Zmc2V0LCBpbmZvLnlPZmZzZXQsIHdpZHRoLCBoZWlnaHQsIDApO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdmFyIG51bGxEYXRhID0gIWRhdGE7XHJcbiAgICAgIGlmIChudWxsRGF0YSkge1xyXG4gICAgICAgIGRhdGEgPSBwb29sLnplcm8uYWxsb2NUeXBlKHR5cGUsIHdpZHRoICogaGVpZ2h0ICogY2hhbm5lbHMpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBnbC50ZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgd2lkdGgsIGhlaWdodCwgMCwgZm9ybWF0LCB0eXBlLCBkYXRhKTtcclxuXHJcbiAgICAgIGlmIChudWxsRGF0YSAmJiBkYXRhKSB7XHJcbiAgICAgICAgcG9vbC56ZXJvLmZyZWVUeXBlKGRhdGEpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBzZXRTdWJJbWFnZSAoaW5mbywgdGFyZ2V0LCB4LCB5LCBtaXBsZXZlbCkge1xyXG4gICAgdmFyIGVsZW1lbnQgPSBpbmZvLmVsZW1lbnQ7XHJcbiAgICB2YXIgZGF0YSA9IGluZm8uZGF0YTtcclxuICAgIHZhciBpbnRlcm5hbGZvcm1hdCA9IGluZm8uaW50ZXJuYWxmb3JtYXQ7XHJcbiAgICB2YXIgZm9ybWF0ID0gaW5mby5mb3JtYXQ7XHJcbiAgICB2YXIgdHlwZSA9IGluZm8udHlwZTtcclxuICAgIHZhciB3aWR0aCA9IGluZm8ud2lkdGg7XHJcbiAgICB2YXIgaGVpZ2h0ID0gaW5mby5oZWlnaHQ7XHJcblxyXG4gICAgc2V0RmxhZ3MoaW5mbyk7XHJcblxyXG4gICAgaWYgKGVsZW1lbnQpIHtcclxuICAgICAgZ2wudGV4U3ViSW1hZ2UyRChcclxuICAgICAgICB0YXJnZXQsIG1pcGxldmVsLCB4LCB5LCBmb3JtYXQsIHR5cGUsIGVsZW1lbnQpO1xyXG4gICAgfSBlbHNlIGlmIChpbmZvLmNvbXByZXNzZWQpIHtcclxuICAgICAgZ2wuY29tcHJlc3NlZFRleFN1YkltYWdlMkQoXHJcbiAgICAgICAgdGFyZ2V0LCBtaXBsZXZlbCwgeCwgeSwgaW50ZXJuYWxmb3JtYXQsIHdpZHRoLCBoZWlnaHQsIGRhdGEpO1xyXG4gICAgfSBlbHNlIGlmIChpbmZvLm5lZWRzQ29weSkge1xyXG4gICAgICByZWdsUG9sbCgpO1xyXG4gICAgICBnbC5jb3B5VGV4U3ViSW1hZ2UyRChcclxuICAgICAgICB0YXJnZXQsIG1pcGxldmVsLCB4LCB5LCBpbmZvLnhPZmZzZXQsIGluZm8ueU9mZnNldCwgd2lkdGgsIGhlaWdodCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBnbC50ZXhTdWJJbWFnZTJEKFxyXG4gICAgICAgIHRhcmdldCwgbWlwbGV2ZWwsIHgsIHksIHdpZHRoLCBoZWlnaHQsIGZvcm1hdCwgdHlwZSwgZGF0YSk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvLyB0ZXhJbWFnZSBwb29sXHJcbiAgdmFyIGltYWdlUG9vbCA9IFtdO1xyXG5cclxuICBmdW5jdGlvbiBhbGxvY0ltYWdlICgpIHtcclxuICAgIHJldHVybiBpbWFnZVBvb2wucG9wKCkgfHwgbmV3IFRleEltYWdlKClcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGZyZWVJbWFnZSAoaW1hZ2UpIHtcclxuICAgIGlmIChpbWFnZS5uZWVkc0ZyZWUpIHtcclxuICAgICAgcG9vbC5mcmVlVHlwZShpbWFnZS5kYXRhKTtcclxuICAgIH1cclxuICAgIFRleEltYWdlLmNhbGwoaW1hZ2UpO1xyXG4gICAgaW1hZ2VQb29sLnB1c2goaW1hZ2UpO1xyXG4gIH1cclxuXHJcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gIC8vIE1pcCBtYXBcclxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgZnVuY3Rpb24gTWlwTWFwICgpIHtcclxuICAgIFRleEZsYWdzLmNhbGwodGhpcyk7XHJcblxyXG4gICAgdGhpcy5nZW5NaXBtYXBzID0gZmFsc2U7XHJcbiAgICB0aGlzLm1pcG1hcEhpbnQgPSBHTF9ET05UX0NBUkU7XHJcbiAgICB0aGlzLm1pcG1hc2sgPSAwO1xyXG4gICAgdGhpcy5pbWFnZXMgPSBBcnJheSgxNik7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBwYXJzZU1pcE1hcEZyb21TaGFwZSAobWlwbWFwLCB3aWR0aCwgaGVpZ2h0KSB7XHJcbiAgICB2YXIgaW1nID0gbWlwbWFwLmltYWdlc1swXSA9IGFsbG9jSW1hZ2UoKTtcclxuICAgIG1pcG1hcC5taXBtYXNrID0gMTtcclxuICAgIGltZy53aWR0aCA9IG1pcG1hcC53aWR0aCA9IHdpZHRoO1xyXG4gICAgaW1nLmhlaWdodCA9IG1pcG1hcC5oZWlnaHQgPSBoZWlnaHQ7XHJcbiAgICBpbWcuY2hhbm5lbHMgPSBtaXBtYXAuY2hhbm5lbHMgPSA0O1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gcGFyc2VNaXBNYXBGcm9tT2JqZWN0IChtaXBtYXAsIG9wdGlvbnMpIHtcclxuICAgIHZhciBpbWdEYXRhID0gbnVsbDtcclxuICAgIGlmIChpc1BpeGVsRGF0YShvcHRpb25zKSkge1xyXG4gICAgICBpbWdEYXRhID0gbWlwbWFwLmltYWdlc1swXSA9IGFsbG9jSW1hZ2UoKTtcclxuICAgICAgY29weUZsYWdzKGltZ0RhdGEsIG1pcG1hcCk7XHJcbiAgICAgIHBhcnNlSW1hZ2UoaW1nRGF0YSwgb3B0aW9ucyk7XHJcbiAgICAgIG1pcG1hcC5taXBtYXNrID0gMTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHBhcnNlRmxhZ3MobWlwbWFwLCBvcHRpb25zKTtcclxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkob3B0aW9ucy5taXBtYXApKSB7XHJcbiAgICAgICAgdmFyIG1pcERhdGEgPSBvcHRpb25zLm1pcG1hcDtcclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1pcERhdGEubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgIGltZ0RhdGEgPSBtaXBtYXAuaW1hZ2VzW2ldID0gYWxsb2NJbWFnZSgpO1xyXG4gICAgICAgICAgY29weUZsYWdzKGltZ0RhdGEsIG1pcG1hcCk7XHJcbiAgICAgICAgICBpbWdEYXRhLndpZHRoID4+PSBpO1xyXG4gICAgICAgICAgaW1nRGF0YS5oZWlnaHQgPj49IGk7XHJcbiAgICAgICAgICBwYXJzZUltYWdlKGltZ0RhdGEsIG1pcERhdGFbaV0pO1xyXG4gICAgICAgICAgbWlwbWFwLm1pcG1hc2sgfD0gKDEgPDwgaSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGltZ0RhdGEgPSBtaXBtYXAuaW1hZ2VzWzBdID0gYWxsb2NJbWFnZSgpO1xyXG4gICAgICAgIGNvcHlGbGFncyhpbWdEYXRhLCBtaXBtYXApO1xyXG4gICAgICAgIHBhcnNlSW1hZ2UoaW1nRGF0YSwgb3B0aW9ucyk7XHJcbiAgICAgICAgbWlwbWFwLm1pcG1hc2sgPSAxO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBjb3B5RmxhZ3MobWlwbWFwLCBtaXBtYXAuaW1hZ2VzWzBdKTtcclxuXHJcbiAgICAvLyBGb3IgdGV4dHVyZXMgb2YgdGhlIGNvbXByZXNzZWQgZm9ybWF0IFdFQkdMX2NvbXByZXNzZWRfdGV4dHVyZV9zM3RjXHJcbiAgICAvLyB3ZSBtdXN0IGhhdmUgdGhhdFxyXG4gICAgLy9cclxuICAgIC8vIFwiV2hlbiBsZXZlbCBlcXVhbHMgemVybyB3aWR0aCBhbmQgaGVpZ2h0IG11c3QgYmUgYSBtdWx0aXBsZSBvZiA0LlxyXG4gICAgLy8gV2hlbiBsZXZlbCBpcyBncmVhdGVyIHRoYW4gMCB3aWR0aCBhbmQgaGVpZ2h0IG11c3QgYmUgMCwgMSwgMiBvciBhIG11bHRpcGxlIG9mIDQuIFwiXHJcbiAgICAvL1xyXG4gICAgLy8gYnV0IHdlIGRvIG5vdCB5ZXQgc3VwcG9ydCBoYXZpbmcgbXVsdGlwbGUgbWlwbWFwIGxldmVscyBmb3IgY29tcHJlc3NlZCB0ZXh0dXJlcyxcclxuICAgIC8vIHNvIHdlIG9ubHkgdGVzdCBmb3IgbGV2ZWwgemVyby5cclxuXHJcbiAgICBpZiAobWlwbWFwLmNvbXByZXNzZWQgJiZcclxuICAgICAgICAobWlwbWFwLmludGVybmFsZm9ybWF0ID09PSBHTF9DT01QUkVTU0VEX1JHQl9TM1RDX0RYVDFfRVhUKSB8fFxyXG4gICAgICAgIChtaXBtYXAuaW50ZXJuYWxmb3JtYXQgPT09IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDFfRVhUKSB8fFxyXG4gICAgICAgIChtaXBtYXAuaW50ZXJuYWxmb3JtYXQgPT09IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDNfRVhUKSB8fFxyXG4gICAgICAgIChtaXBtYXAuaW50ZXJuYWxmb3JtYXQgPT09IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDVfRVhUKSkge1xyXG4gICAgICBjaGVjayQxKG1pcG1hcC53aWR0aCAlIDQgPT09IDAgJiZcclxuICAgICAgICAgICAgbWlwbWFwLmhlaWdodCAlIDQgPT09IDAsXHJcbiAgICAgICAgICAgICdmb3IgY29tcHJlc3NlZCB0ZXh0dXJlIGZvcm1hdHMsIG1pcG1hcCBsZXZlbCAwIG11c3QgaGF2ZSB3aWR0aCBhbmQgaGVpZ2h0IHRoYXQgYXJlIGEgbXVsdGlwbGUgb2YgNCcpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gc2V0TWlwTWFwIChtaXBtYXAsIHRhcmdldCkge1xyXG4gICAgdmFyIGltYWdlcyA9IG1pcG1hcC5pbWFnZXM7XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGltYWdlcy5sZW5ndGg7ICsraSkge1xyXG4gICAgICBpZiAoIWltYWdlc1tpXSkge1xyXG4gICAgICAgIHJldHVyblxyXG4gICAgICB9XHJcbiAgICAgIHNldEltYWdlKGltYWdlc1tpXSwgdGFyZ2V0LCBpKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHZhciBtaXBQb29sID0gW107XHJcblxyXG4gIGZ1bmN0aW9uIGFsbG9jTWlwTWFwICgpIHtcclxuICAgIHZhciByZXN1bHQgPSBtaXBQb29sLnBvcCgpIHx8IG5ldyBNaXBNYXAoKTtcclxuICAgIFRleEZsYWdzLmNhbGwocmVzdWx0KTtcclxuICAgIHJlc3VsdC5taXBtYXNrID0gMDtcclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgMTY7ICsraSkge1xyXG4gICAgICByZXN1bHQuaW1hZ2VzW2ldID0gbnVsbDtcclxuICAgIH1cclxuICAgIHJldHVybiByZXN1bHRcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGZyZWVNaXBNYXAgKG1pcG1hcCkge1xyXG4gICAgdmFyIGltYWdlcyA9IG1pcG1hcC5pbWFnZXM7XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGltYWdlcy5sZW5ndGg7ICsraSkge1xyXG4gICAgICBpZiAoaW1hZ2VzW2ldKSB7XHJcbiAgICAgICAgZnJlZUltYWdlKGltYWdlc1tpXSk7XHJcbiAgICAgIH1cclxuICAgICAgaW1hZ2VzW2ldID0gbnVsbDtcclxuICAgIH1cclxuICAgIG1pcFBvb2wucHVzaChtaXBtYXApO1xyXG4gIH1cclxuXHJcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gIC8vIFRleCBpbmZvXHJcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gIGZ1bmN0aW9uIFRleEluZm8gKCkge1xyXG4gICAgdGhpcy5taW5GaWx0ZXIgPSBHTF9ORUFSRVNUJDE7XHJcbiAgICB0aGlzLm1hZ0ZpbHRlciA9IEdMX05FQVJFU1QkMTtcclxuXHJcbiAgICB0aGlzLndyYXBTID0gR0xfQ0xBTVBfVE9fRURHRSQxO1xyXG4gICAgdGhpcy53cmFwVCA9IEdMX0NMQU1QX1RPX0VER0UkMTtcclxuXHJcbiAgICB0aGlzLmFuaXNvdHJvcGljID0gMTtcclxuXHJcbiAgICB0aGlzLmdlbk1pcG1hcHMgPSBmYWxzZTtcclxuICAgIHRoaXMubWlwbWFwSGludCA9IEdMX0RPTlRfQ0FSRTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHBhcnNlVGV4SW5mbyAoaW5mbywgb3B0aW9ucykge1xyXG4gICAgaWYgKCdtaW4nIGluIG9wdGlvbnMpIHtcclxuICAgICAgdmFyIG1pbkZpbHRlciA9IG9wdGlvbnMubWluO1xyXG4gICAgICBjaGVjayQxLnBhcmFtZXRlcihtaW5GaWx0ZXIsIG1pbkZpbHRlcnMpO1xyXG4gICAgICBpbmZvLm1pbkZpbHRlciA9IG1pbkZpbHRlcnNbbWluRmlsdGVyXTtcclxuICAgICAgaWYgKE1JUE1BUF9GSUxURVJTLmluZGV4T2YoaW5mby5taW5GaWx0ZXIpID49IDAgJiYgISgnZmFjZXMnIGluIG9wdGlvbnMpKSB7XHJcbiAgICAgICAgaW5mby5nZW5NaXBtYXBzID0gdHJ1ZTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmICgnbWFnJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgIHZhciBtYWdGaWx0ZXIgPSBvcHRpb25zLm1hZztcclxuICAgICAgY2hlY2skMS5wYXJhbWV0ZXIobWFnRmlsdGVyLCBtYWdGaWx0ZXJzKTtcclxuICAgICAgaW5mby5tYWdGaWx0ZXIgPSBtYWdGaWx0ZXJzW21hZ0ZpbHRlcl07XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIHdyYXBTID0gaW5mby53cmFwUztcclxuICAgIHZhciB3cmFwVCA9IGluZm8ud3JhcFQ7XHJcbiAgICBpZiAoJ3dyYXAnIGluIG9wdGlvbnMpIHtcclxuICAgICAgdmFyIHdyYXAgPSBvcHRpb25zLndyYXA7XHJcbiAgICAgIGlmICh0eXBlb2Ygd3JhcCA9PT0gJ3N0cmluZycpIHtcclxuICAgICAgICBjaGVjayQxLnBhcmFtZXRlcih3cmFwLCB3cmFwTW9kZXMpO1xyXG4gICAgICAgIHdyYXBTID0gd3JhcFQgPSB3cmFwTW9kZXNbd3JhcF07XHJcbiAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheSh3cmFwKSkge1xyXG4gICAgICAgIGNoZWNrJDEucGFyYW1ldGVyKHdyYXBbMF0sIHdyYXBNb2Rlcyk7XHJcbiAgICAgICAgY2hlY2skMS5wYXJhbWV0ZXIod3JhcFsxXSwgd3JhcE1vZGVzKTtcclxuICAgICAgICB3cmFwUyA9IHdyYXBNb2Rlc1t3cmFwWzBdXTtcclxuICAgICAgICB3cmFwVCA9IHdyYXBNb2Rlc1t3cmFwWzFdXTtcclxuICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgaWYgKCd3cmFwUycgaW4gb3B0aW9ucykge1xyXG4gICAgICAgIHZhciBvcHRXcmFwUyA9IG9wdGlvbnMud3JhcFM7XHJcbiAgICAgICAgY2hlY2skMS5wYXJhbWV0ZXIob3B0V3JhcFMsIHdyYXBNb2Rlcyk7XHJcbiAgICAgICAgd3JhcFMgPSB3cmFwTW9kZXNbb3B0V3JhcFNdO1xyXG4gICAgICB9XHJcbiAgICAgIGlmICgnd3JhcFQnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICB2YXIgb3B0V3JhcFQgPSBvcHRpb25zLndyYXBUO1xyXG4gICAgICAgIGNoZWNrJDEucGFyYW1ldGVyKG9wdFdyYXBULCB3cmFwTW9kZXMpO1xyXG4gICAgICAgIHdyYXBUID0gd3JhcE1vZGVzW29wdFdyYXBUXTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgaW5mby53cmFwUyA9IHdyYXBTO1xyXG4gICAgaW5mby53cmFwVCA9IHdyYXBUO1xyXG5cclxuICAgIGlmICgnYW5pc290cm9waWMnIGluIG9wdGlvbnMpIHtcclxuICAgICAgdmFyIGFuaXNvdHJvcGljID0gb3B0aW9ucy5hbmlzb3Ryb3BpYztcclxuICAgICAgY2hlY2skMSh0eXBlb2YgYW5pc290cm9waWMgPT09ICdudW1iZXInICYmXHJcbiAgICAgICAgIGFuaXNvdHJvcGljID49IDEgJiYgYW5pc290cm9waWMgPD0gbGltaXRzLm1heEFuaXNvdHJvcGljLFxyXG4gICAgICAgICdhbmlzbyBzYW1wbGVzIG11c3QgYmUgYmV0d2VlbiAxIGFuZCAnKTtcclxuICAgICAgaW5mby5hbmlzb3Ryb3BpYyA9IG9wdGlvbnMuYW5pc290cm9waWM7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCdtaXBtYXAnIGluIG9wdGlvbnMpIHtcclxuICAgICAgdmFyIGhhc01pcE1hcCA9IGZhbHNlO1xyXG4gICAgICBzd2l0Y2ggKHR5cGVvZiBvcHRpb25zLm1pcG1hcCkge1xyXG4gICAgICAgIGNhc2UgJ3N0cmluZyc6XHJcbiAgICAgICAgICBjaGVjayQxLnBhcmFtZXRlcihvcHRpb25zLm1pcG1hcCwgbWlwbWFwSGludCxcclxuICAgICAgICAgICAgJ2ludmFsaWQgbWlwbWFwIGhpbnQnKTtcclxuICAgICAgICAgIGluZm8ubWlwbWFwSGludCA9IG1pcG1hcEhpbnRbb3B0aW9ucy5taXBtYXBdO1xyXG4gICAgICAgICAgaW5mby5nZW5NaXBtYXBzID0gdHJ1ZTtcclxuICAgICAgICAgIGhhc01pcE1hcCA9IHRydWU7XHJcbiAgICAgICAgICBicmVha1xyXG5cclxuICAgICAgICBjYXNlICdib29sZWFuJzpcclxuICAgICAgICAgIGhhc01pcE1hcCA9IGluZm8uZ2VuTWlwbWFwcyA9IG9wdGlvbnMubWlwbWFwO1xyXG4gICAgICAgICAgYnJlYWtcclxuXHJcbiAgICAgICAgY2FzZSAnb2JqZWN0JzpcclxuICAgICAgICAgIGNoZWNrJDEoQXJyYXkuaXNBcnJheShvcHRpb25zLm1pcG1hcCksICdpbnZhbGlkIG1pcG1hcCB0eXBlJyk7XHJcbiAgICAgICAgICBpbmZvLmdlbk1pcG1hcHMgPSBmYWxzZTtcclxuICAgICAgICAgIGhhc01pcE1hcCA9IHRydWU7XHJcbiAgICAgICAgICBicmVha1xyXG5cclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgY2hlY2skMS5yYWlzZSgnaW52YWxpZCBtaXBtYXAgdHlwZScpO1xyXG4gICAgICB9XHJcbiAgICAgIGlmIChoYXNNaXBNYXAgJiYgISgnbWluJyBpbiBvcHRpb25zKSkge1xyXG4gICAgICAgIGluZm8ubWluRmlsdGVyID0gR0xfTkVBUkVTVF9NSVBNQVBfTkVBUkVTVCQxO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBzZXRUZXhJbmZvIChpbmZvLCB0YXJnZXQpIHtcclxuICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX01JTl9GSUxURVIsIGluZm8ubWluRmlsdGVyKTtcclxuICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX01BR19GSUxURVIsIGluZm8ubWFnRmlsdGVyKTtcclxuICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX1dSQVBfUywgaW5mby53cmFwUyk7XHJcbiAgICBnbC50ZXhQYXJhbWV0ZXJpKHRhcmdldCwgR0xfVEVYVFVSRV9XUkFQX1QsIGluZm8ud3JhcFQpO1xyXG4gICAgaWYgKGV4dGVuc2lvbnMuZXh0X3RleHR1cmVfZmlsdGVyX2FuaXNvdHJvcGljKSB7XHJcbiAgICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX01BWF9BTklTT1RST1BZX0VYVCwgaW5mby5hbmlzb3Ryb3BpYyk7XHJcbiAgICB9XHJcbiAgICBpZiAoaW5mby5nZW5NaXBtYXBzKSB7XHJcbiAgICAgIGdsLmhpbnQoR0xfR0VORVJBVEVfTUlQTUFQX0hJTlQsIGluZm8ubWlwbWFwSGludCk7XHJcbiAgICAgIGdsLmdlbmVyYXRlTWlwbWFwKHRhcmdldCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgLy8gRnVsbCB0ZXh0dXJlIG9iamVjdFxyXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICB2YXIgdGV4dHVyZUNvdW50ID0gMDtcclxuICB2YXIgdGV4dHVyZVNldCA9IHt9O1xyXG4gIHZhciBudW1UZXhVbml0cyA9IGxpbWl0cy5tYXhUZXh0dXJlVW5pdHM7XHJcbiAgdmFyIHRleHR1cmVVbml0cyA9IEFycmF5KG51bVRleFVuaXRzKS5tYXAoZnVuY3Rpb24gKCkge1xyXG4gICAgcmV0dXJuIG51bGxcclxuICB9KTtcclxuXHJcbiAgZnVuY3Rpb24gUkVHTFRleHR1cmUgKHRhcmdldCkge1xyXG4gICAgVGV4RmxhZ3MuY2FsbCh0aGlzKTtcclxuICAgIHRoaXMubWlwbWFzayA9IDA7XHJcbiAgICB0aGlzLmludGVybmFsZm9ybWF0ID0gR0xfUkdCQSQxO1xyXG5cclxuICAgIHRoaXMuaWQgPSB0ZXh0dXJlQ291bnQrKztcclxuXHJcbiAgICB0aGlzLnJlZkNvdW50ID0gMTtcclxuXHJcbiAgICB0aGlzLnRhcmdldCA9IHRhcmdldDtcclxuICAgIHRoaXMudGV4dHVyZSA9IGdsLmNyZWF0ZVRleHR1cmUoKTtcclxuXHJcbiAgICB0aGlzLnVuaXQgPSAtMTtcclxuICAgIHRoaXMuYmluZENvdW50ID0gMDtcclxuXHJcbiAgICB0aGlzLnRleEluZm8gPSBuZXcgVGV4SW5mbygpO1xyXG5cclxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xyXG4gICAgICB0aGlzLnN0YXRzID0ge3NpemU6IDB9O1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gdGVtcEJpbmQgKHRleHR1cmUpIHtcclxuICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTAkMSk7XHJcbiAgICBnbC5iaW5kVGV4dHVyZSh0ZXh0dXJlLnRhcmdldCwgdGV4dHVyZS50ZXh0dXJlKTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHRlbXBSZXN0b3JlICgpIHtcclxuICAgIHZhciBwcmV2ID0gdGV4dHVyZVVuaXRzWzBdO1xyXG4gICAgaWYgKHByZXYpIHtcclxuICAgICAgZ2wuYmluZFRleHR1cmUocHJldi50YXJnZXQsIHByZXYudGV4dHVyZSk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBnbC5iaW5kVGV4dHVyZShHTF9URVhUVVJFXzJEJDEsIG51bGwpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZGVzdHJveSAodGV4dHVyZSkge1xyXG4gICAgdmFyIGhhbmRsZSA9IHRleHR1cmUudGV4dHVyZTtcclxuICAgIGNoZWNrJDEoaGFuZGxlLCAnbXVzdCBub3QgZG91YmxlIGRlc3Ryb3kgdGV4dHVyZScpO1xyXG4gICAgdmFyIHVuaXQgPSB0ZXh0dXJlLnVuaXQ7XHJcbiAgICB2YXIgdGFyZ2V0ID0gdGV4dHVyZS50YXJnZXQ7XHJcbiAgICBpZiAodW5pdCA+PSAwKSB7XHJcbiAgICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTAkMSArIHVuaXQpO1xyXG4gICAgICBnbC5iaW5kVGV4dHVyZSh0YXJnZXQsIG51bGwpO1xyXG4gICAgICB0ZXh0dXJlVW5pdHNbdW5pdF0gPSBudWxsO1xyXG4gICAgfVxyXG4gICAgZ2wuZGVsZXRlVGV4dHVyZShoYW5kbGUpO1xyXG4gICAgdGV4dHVyZS50ZXh0dXJlID0gbnVsbDtcclxuICAgIHRleHR1cmUucGFyYW1zID0gbnVsbDtcclxuICAgIHRleHR1cmUucGl4ZWxzID0gbnVsbDtcclxuICAgIHRleHR1cmUucmVmQ291bnQgPSAwO1xyXG4gICAgZGVsZXRlIHRleHR1cmVTZXRbdGV4dHVyZS5pZF07XHJcbiAgICBzdGF0cy50ZXh0dXJlQ291bnQtLTtcclxuICB9XHJcblxyXG4gIGV4dGVuZChSRUdMVGV4dHVyZS5wcm90b3R5cGUsIHtcclxuICAgIGJpbmQ6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgdmFyIHRleHR1cmUgPSB0aGlzO1xyXG4gICAgICB0ZXh0dXJlLmJpbmRDb3VudCArPSAxO1xyXG4gICAgICB2YXIgdW5pdCA9IHRleHR1cmUudW5pdDtcclxuICAgICAgaWYgKHVuaXQgPCAwKSB7XHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1UZXhVbml0czsgKytpKSB7XHJcbiAgICAgICAgICB2YXIgb3RoZXIgPSB0ZXh0dXJlVW5pdHNbaV07XHJcbiAgICAgICAgICBpZiAob3RoZXIpIHtcclxuICAgICAgICAgICAgaWYgKG90aGVyLmJpbmRDb3VudCA+IDApIHtcclxuICAgICAgICAgICAgICBjb250aW51ZVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG90aGVyLnVuaXQgPSAtMTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIHRleHR1cmVVbml0c1tpXSA9IHRleHR1cmU7XHJcbiAgICAgICAgICB1bml0ID0gaTtcclxuICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh1bml0ID49IG51bVRleFVuaXRzKSB7XHJcbiAgICAgICAgICBjaGVjayQxLnJhaXNlKCdpbnN1ZmZpY2llbnQgbnVtYmVyIG9mIHRleHR1cmUgdW5pdHMnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGNvbmZpZy5wcm9maWxlICYmIHN0YXRzLm1heFRleHR1cmVVbml0cyA8ICh1bml0ICsgMSkpIHtcclxuICAgICAgICAgIHN0YXRzLm1heFRleHR1cmVVbml0cyA9IHVuaXQgKyAxOyAvLyArMSwgc2luY2UgdGhlIHVuaXRzIGFyZSB6ZXJvLWJhc2VkXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRleHR1cmUudW5pdCA9IHVuaXQ7XHJcbiAgICAgICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCQxICsgdW5pdCk7XHJcbiAgICAgICAgZ2wuYmluZFRleHR1cmUodGV4dHVyZS50YXJnZXQsIHRleHR1cmUudGV4dHVyZSk7XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIHVuaXRcclxuICAgIH0sXHJcblxyXG4gICAgdW5iaW5kOiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgIHRoaXMuYmluZENvdW50IC09IDE7XHJcbiAgICB9LFxyXG5cclxuICAgIGRlY1JlZjogZnVuY3Rpb24gKCkge1xyXG4gICAgICBpZiAoLS10aGlzLnJlZkNvdW50IDw9IDApIHtcclxuICAgICAgICBkZXN0cm95KHRoaXMpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIGZ1bmN0aW9uIGNyZWF0ZVRleHR1cmUyRCAoYSwgYikge1xyXG4gICAgdmFyIHRleHR1cmUgPSBuZXcgUkVHTFRleHR1cmUoR0xfVEVYVFVSRV8yRCQxKTtcclxuICAgIHRleHR1cmVTZXRbdGV4dHVyZS5pZF0gPSB0ZXh0dXJlO1xyXG4gICAgc3RhdHMudGV4dHVyZUNvdW50Kys7XHJcblxyXG4gICAgZnVuY3Rpb24gcmVnbFRleHR1cmUyRCAoYSwgYikge1xyXG4gICAgICB2YXIgdGV4SW5mbyA9IHRleHR1cmUudGV4SW5mbztcclxuICAgICAgVGV4SW5mby5jYWxsKHRleEluZm8pO1xyXG4gICAgICB2YXIgbWlwRGF0YSA9IGFsbG9jTWlwTWFwKCk7XHJcblxyXG4gICAgICBpZiAodHlwZW9mIGEgPT09ICdudW1iZXInKSB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiBiID09PSAnbnVtYmVyJykge1xyXG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tU2hhcGUobWlwRGF0YSwgYSB8IDAsIGIgfCAwKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tU2hhcGUobWlwRGF0YSwgYSB8IDAsIGEgfCAwKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSBpZiAoYSkge1xyXG4gICAgICAgIGNoZWNrJDEudHlwZShhLCAnb2JqZWN0JywgJ2ludmFsaWQgYXJndW1lbnRzIHRvIHJlZ2wudGV4dHVyZScpO1xyXG4gICAgICAgIHBhcnNlVGV4SW5mbyh0ZXhJbmZvLCBhKTtcclxuICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QobWlwRGF0YSwgYSk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gZW1wdHkgdGV4dHVyZXMgZ2V0IGFzc2lnbmVkIGEgZGVmYXVsdCBzaGFwZSBvZiAxeDFcclxuICAgICAgICBwYXJzZU1pcE1hcEZyb21TaGFwZShtaXBEYXRhLCAxLCAxKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKHRleEluZm8uZ2VuTWlwbWFwcykge1xyXG4gICAgICAgIG1pcERhdGEubWlwbWFzayA9IChtaXBEYXRhLndpZHRoIDw8IDEpIC0gMTtcclxuICAgICAgfVxyXG4gICAgICB0ZXh0dXJlLm1pcG1hc2sgPSBtaXBEYXRhLm1pcG1hc2s7XHJcblxyXG4gICAgICBjb3B5RmxhZ3ModGV4dHVyZSwgbWlwRGF0YSk7XHJcblxyXG4gICAgICBjaGVjayQxLnRleHR1cmUyRCh0ZXhJbmZvLCBtaXBEYXRhLCBsaW1pdHMpO1xyXG4gICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0ID0gbWlwRGF0YS5pbnRlcm5hbGZvcm1hdDtcclxuXHJcbiAgICAgIHJlZ2xUZXh0dXJlMkQud2lkdGggPSBtaXBEYXRhLndpZHRoO1xyXG4gICAgICByZWdsVGV4dHVyZTJELmhlaWdodCA9IG1pcERhdGEuaGVpZ2h0O1xyXG5cclxuICAgICAgdGVtcEJpbmQodGV4dHVyZSk7XHJcbiAgICAgIHNldE1pcE1hcChtaXBEYXRhLCBHTF9URVhUVVJFXzJEJDEpO1xyXG4gICAgICBzZXRUZXhJbmZvKHRleEluZm8sIEdMX1RFWFRVUkVfMkQkMSk7XHJcbiAgICAgIHRlbXBSZXN0b3JlKCk7XHJcblxyXG4gICAgICBmcmVlTWlwTWFwKG1pcERhdGEpO1xyXG5cclxuICAgICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XHJcbiAgICAgICAgdGV4dHVyZS5zdGF0cy5zaXplID0gZ2V0VGV4dHVyZVNpemUoXHJcbiAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxyXG4gICAgICAgICAgdGV4dHVyZS50eXBlLFxyXG4gICAgICAgICAgbWlwRGF0YS53aWR0aCxcclxuICAgICAgICAgIG1pcERhdGEuaGVpZ2h0LFxyXG4gICAgICAgICAgdGV4SW5mby5nZW5NaXBtYXBzLFxyXG4gICAgICAgICAgZmFsc2UpO1xyXG4gICAgICB9XHJcbiAgICAgIHJlZ2xUZXh0dXJlMkQuZm9ybWF0ID0gdGV4dHVyZUZvcm1hdHNJbnZlcnRbdGV4dHVyZS5pbnRlcm5hbGZvcm1hdF07XHJcbiAgICAgIHJlZ2xUZXh0dXJlMkQudHlwZSA9IHRleHR1cmVUeXBlc0ludmVydFt0ZXh0dXJlLnR5cGVdO1xyXG5cclxuICAgICAgcmVnbFRleHR1cmUyRC5tYWcgPSBtYWdGaWx0ZXJzSW52ZXJ0W3RleEluZm8ubWFnRmlsdGVyXTtcclxuICAgICAgcmVnbFRleHR1cmUyRC5taW4gPSBtaW5GaWx0ZXJzSW52ZXJ0W3RleEluZm8ubWluRmlsdGVyXTtcclxuXHJcbiAgICAgIHJlZ2xUZXh0dXJlMkQud3JhcFMgPSB3cmFwTW9kZXNJbnZlcnRbdGV4SW5mby53cmFwU107XHJcbiAgICAgIHJlZ2xUZXh0dXJlMkQud3JhcFQgPSB3cmFwTW9kZXNJbnZlcnRbdGV4SW5mby53cmFwVF07XHJcblxyXG4gICAgICByZXR1cm4gcmVnbFRleHR1cmUyRFxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHN1YmltYWdlIChpbWFnZSwgeF8sIHlfLCBsZXZlbF8pIHtcclxuICAgICAgY2hlY2skMSghIWltYWdlLCAnbXVzdCBzcGVjaWZ5IGltYWdlIGRhdGEnKTtcclxuXHJcbiAgICAgIHZhciB4ID0geF8gfCAwO1xyXG4gICAgICB2YXIgeSA9IHlfIHwgMDtcclxuICAgICAgdmFyIGxldmVsID0gbGV2ZWxfIHwgMDtcclxuXHJcbiAgICAgIHZhciBpbWFnZURhdGEgPSBhbGxvY0ltYWdlKCk7XHJcbiAgICAgIGNvcHlGbGFncyhpbWFnZURhdGEsIHRleHR1cmUpO1xyXG4gICAgICBpbWFnZURhdGEud2lkdGggPSAwO1xyXG4gICAgICBpbWFnZURhdGEuaGVpZ2h0ID0gMDtcclxuICAgICAgcGFyc2VJbWFnZShpbWFnZURhdGEsIGltYWdlKTtcclxuICAgICAgaW1hZ2VEYXRhLndpZHRoID0gaW1hZ2VEYXRhLndpZHRoIHx8ICgodGV4dHVyZS53aWR0aCA+PiBsZXZlbCkgLSB4KTtcclxuICAgICAgaW1hZ2VEYXRhLmhlaWdodCA9IGltYWdlRGF0YS5oZWlnaHQgfHwgKCh0ZXh0dXJlLmhlaWdodCA+PiBsZXZlbCkgLSB5KTtcclxuXHJcbiAgICAgIGNoZWNrJDEoXHJcbiAgICAgICAgdGV4dHVyZS50eXBlID09PSBpbWFnZURhdGEudHlwZSAmJlxyXG4gICAgICAgIHRleHR1cmUuZm9ybWF0ID09PSBpbWFnZURhdGEuZm9ybWF0ICYmXHJcbiAgICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCA9PT0gaW1hZ2VEYXRhLmludGVybmFsZm9ybWF0LFxyXG4gICAgICAgICdpbmNvbXBhdGlibGUgZm9ybWF0IGZvciB0ZXh0dXJlLnN1YmltYWdlJyk7XHJcbiAgICAgIGNoZWNrJDEoXHJcbiAgICAgICAgeCA+PSAwICYmIHkgPj0gMCAmJlxyXG4gICAgICAgIHggKyBpbWFnZURhdGEud2lkdGggPD0gdGV4dHVyZS53aWR0aCAmJlxyXG4gICAgICAgIHkgKyBpbWFnZURhdGEuaGVpZ2h0IDw9IHRleHR1cmUuaGVpZ2h0LFxyXG4gICAgICAgICd0ZXh0dXJlLnN1YmltYWdlIHdyaXRlIG91dCBvZiBib3VuZHMnKTtcclxuICAgICAgY2hlY2skMShcclxuICAgICAgICB0ZXh0dXJlLm1pcG1hc2sgJiAoMSA8PCBsZXZlbCksXHJcbiAgICAgICAgJ21pc3NpbmcgbWlwbWFwIGRhdGEnKTtcclxuICAgICAgY2hlY2skMShcclxuICAgICAgICBpbWFnZURhdGEuZGF0YSB8fCBpbWFnZURhdGEuZWxlbWVudCB8fCBpbWFnZURhdGEubmVlZHNDb3B5LFxyXG4gICAgICAgICdtaXNzaW5nIGltYWdlIGRhdGEnKTtcclxuXHJcbiAgICAgIHRlbXBCaW5kKHRleHR1cmUpO1xyXG4gICAgICBzZXRTdWJJbWFnZShpbWFnZURhdGEsIEdMX1RFWFRVUkVfMkQkMSwgeCwgeSwgbGV2ZWwpO1xyXG4gICAgICB0ZW1wUmVzdG9yZSgpO1xyXG5cclxuICAgICAgZnJlZUltYWdlKGltYWdlRGF0YSk7XHJcblxyXG4gICAgICByZXR1cm4gcmVnbFRleHR1cmUyRFxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHJlc2l6ZSAod18sIGhfKSB7XHJcbiAgICAgIHZhciB3ID0gd18gfCAwO1xyXG4gICAgICB2YXIgaCA9IChoXyB8IDApIHx8IHc7XHJcbiAgICAgIGlmICh3ID09PSB0ZXh0dXJlLndpZHRoICYmIGggPT09IHRleHR1cmUuaGVpZ2h0KSB7XHJcbiAgICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlMkRcclxuICAgICAgfVxyXG5cclxuICAgICAgcmVnbFRleHR1cmUyRC53aWR0aCA9IHRleHR1cmUud2lkdGggPSB3O1xyXG4gICAgICByZWdsVGV4dHVyZTJELmhlaWdodCA9IHRleHR1cmUuaGVpZ2h0ID0gaDtcclxuXHJcbiAgICAgIHRlbXBCaW5kKHRleHR1cmUpO1xyXG5cclxuICAgICAgdmFyIGRhdGE7XHJcbiAgICAgIHZhciBjaGFubmVscyA9IHRleHR1cmUuY2hhbm5lbHM7XHJcbiAgICAgIHZhciB0eXBlID0gdGV4dHVyZS50eXBlO1xyXG5cclxuICAgICAgZm9yICh2YXIgaSA9IDA7IHRleHR1cmUubWlwbWFzayA+PiBpOyArK2kpIHtcclxuICAgICAgICB2YXIgX3cgPSB3ID4+IGk7XHJcbiAgICAgICAgdmFyIF9oID0gaCA+PiBpO1xyXG4gICAgICAgIGlmICghX3cgfHwgIV9oKSBicmVha1xyXG4gICAgICAgIGRhdGEgPSBwb29sLnplcm8uYWxsb2NUeXBlKHR5cGUsIF93ICogX2ggKiBjaGFubmVscyk7XHJcbiAgICAgICAgZ2wudGV4SW1hZ2UyRChcclxuICAgICAgICAgIEdMX1RFWFRVUkVfMkQkMSxcclxuICAgICAgICAgIGksXHJcbiAgICAgICAgICB0ZXh0dXJlLmZvcm1hdCxcclxuICAgICAgICAgIF93LFxyXG4gICAgICAgICAgX2gsXHJcbiAgICAgICAgICAwLFxyXG4gICAgICAgICAgdGV4dHVyZS5mb3JtYXQsXHJcbiAgICAgICAgICB0ZXh0dXJlLnR5cGUsXHJcbiAgICAgICAgICBkYXRhKTtcclxuICAgICAgICBpZiAoZGF0YSkgcG9vbC56ZXJvLmZyZWVUeXBlKGRhdGEpO1xyXG4gICAgICB9XHJcbiAgICAgIHRlbXBSZXN0b3JlKCk7XHJcblxyXG4gICAgICAvLyBhbHNvLCByZWNvbXB1dGUgdGhlIHRleHR1cmUgc2l6ZS5cclxuICAgICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XHJcbiAgICAgICAgdGV4dHVyZS5zdGF0cy5zaXplID0gZ2V0VGV4dHVyZVNpemUoXHJcbiAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxyXG4gICAgICAgICAgdGV4dHVyZS50eXBlLFxyXG4gICAgICAgICAgdyxcclxuICAgICAgICAgIGgsXHJcbiAgICAgICAgICBmYWxzZSxcclxuICAgICAgICAgIGZhbHNlKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlMkRcclxuICAgIH1cclxuXHJcbiAgICByZWdsVGV4dHVyZTJEKGEsIGIpO1xyXG5cclxuICAgIHJlZ2xUZXh0dXJlMkQuc3ViaW1hZ2UgPSBzdWJpbWFnZTtcclxuICAgIHJlZ2xUZXh0dXJlMkQucmVzaXplID0gcmVzaXplO1xyXG4gICAgcmVnbFRleHR1cmUyRC5fcmVnbFR5cGUgPSAndGV4dHVyZTJkJztcclxuICAgIHJlZ2xUZXh0dXJlMkQuX3RleHR1cmUgPSB0ZXh0dXJlO1xyXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XHJcbiAgICAgIHJlZ2xUZXh0dXJlMkQuc3RhdHMgPSB0ZXh0dXJlLnN0YXRzO1xyXG4gICAgfVxyXG4gICAgcmVnbFRleHR1cmUyRC5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xyXG4gICAgICB0ZXh0dXJlLmRlY1JlZigpO1xyXG4gICAgfTtcclxuXHJcbiAgICByZXR1cm4gcmVnbFRleHR1cmUyRFxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gY3JlYXRlVGV4dHVyZUN1YmUgKGEwLCBhMSwgYTIsIGEzLCBhNCwgYTUpIHtcclxuICAgIHZhciB0ZXh0dXJlID0gbmV3IFJFR0xUZXh0dXJlKEdMX1RFWFRVUkVfQ1VCRV9NQVAkMSk7XHJcbiAgICB0ZXh0dXJlU2V0W3RleHR1cmUuaWRdID0gdGV4dHVyZTtcclxuICAgIHN0YXRzLmN1YmVDb3VudCsrO1xyXG5cclxuICAgIHZhciBmYWNlcyA9IG5ldyBBcnJheSg2KTtcclxuXHJcbiAgICBmdW5jdGlvbiByZWdsVGV4dHVyZUN1YmUgKGEwLCBhMSwgYTIsIGEzLCBhNCwgYTUpIHtcclxuICAgICAgdmFyIGk7XHJcbiAgICAgIHZhciB0ZXhJbmZvID0gdGV4dHVyZS50ZXhJbmZvO1xyXG4gICAgICBUZXhJbmZvLmNhbGwodGV4SW5mbyk7XHJcbiAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcclxuICAgICAgICBmYWNlc1tpXSA9IGFsbG9jTWlwTWFwKCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmICh0eXBlb2YgYTAgPT09ICdudW1iZXInIHx8ICFhMCkge1xyXG4gICAgICAgIHZhciBzID0gKGEwIHwgMCkgfHwgMTtcclxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XHJcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21TaGFwZShmYWNlc1tpXSwgcywgcyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBhMCA9PT0gJ29iamVjdCcpIHtcclxuICAgICAgICBpZiAoYTEpIHtcclxuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1swXSwgYTApO1xyXG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KGZhY2VzWzFdLCBhMSk7XHJcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbMl0sIGEyKTtcclxuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1szXSwgYTMpO1xyXG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KGZhY2VzWzRdLCBhNCk7XHJcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbNV0sIGE1KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgcGFyc2VUZXhJbmZvKHRleEluZm8sIGEwKTtcclxuICAgICAgICAgIHBhcnNlRmxhZ3ModGV4dHVyZSwgYTApO1xyXG4gICAgICAgICAgaWYgKCdmYWNlcycgaW4gYTApIHtcclxuICAgICAgICAgICAgdmFyIGZhY2VfaW5wdXQgPSBhMC5mYWNlcztcclxuICAgICAgICAgICAgY2hlY2skMShBcnJheS5pc0FycmF5KGZhY2VfaW5wdXQpICYmIGZhY2VfaW5wdXQubGVuZ3RoID09PSA2LFxyXG4gICAgICAgICAgICAgICdjdWJlIGZhY2VzIG11c3QgYmUgYSBsZW5ndGggNiBhcnJheScpO1xyXG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XHJcbiAgICAgICAgICAgICAgY2hlY2skMSh0eXBlb2YgZmFjZV9pbnB1dFtpXSA9PT0gJ29iamVjdCcgJiYgISFmYWNlX2lucHV0W2ldLFxyXG4gICAgICAgICAgICAgICAgJ2ludmFsaWQgaW5wdXQgZm9yIGN1YmUgbWFwIGZhY2UnKTtcclxuICAgICAgICAgICAgICBjb3B5RmxhZ3MoZmFjZXNbaV0sIHRleHR1cmUpO1xyXG4gICAgICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1tpXSwgZmFjZV9pbnB1dFtpXSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcclxuICAgICAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbaV0sIGEwKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBjaGVjayQxLnJhaXNlKCdpbnZhbGlkIGFyZ3VtZW50cyB0byBjdWJlIG1hcCcpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb3B5RmxhZ3ModGV4dHVyZSwgZmFjZXNbMF0pO1xyXG5cclxuICAgICAgaWYgKCFsaW1pdHMubnBvdFRleHR1cmVDdWJlKSB7XHJcbiAgICAgICAgY2hlY2skMShpc1BvdzIkMSh0ZXh0dXJlLndpZHRoKSAmJiBpc1BvdzIkMSh0ZXh0dXJlLmhlaWdodCksICd5b3VyIGJyb3dzZXIgZG9lcyBub3Qgc3VwcG9ydCBub24gcG93ZXIgb3IgdHdvIHRleHR1cmUgZGltZW5zaW9ucycpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAodGV4SW5mby5nZW5NaXBtYXBzKSB7XHJcbiAgICAgICAgdGV4dHVyZS5taXBtYXNrID0gKGZhY2VzWzBdLndpZHRoIDw8IDEpIC0gMTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB0ZXh0dXJlLm1pcG1hc2sgPSBmYWNlc1swXS5taXBtYXNrO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjaGVjayQxLnRleHR1cmVDdWJlKHRleHR1cmUsIHRleEluZm8sIGZhY2VzLCBsaW1pdHMpO1xyXG4gICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0ID0gZmFjZXNbMF0uaW50ZXJuYWxmb3JtYXQ7XHJcblxyXG4gICAgICByZWdsVGV4dHVyZUN1YmUud2lkdGggPSBmYWNlc1swXS53aWR0aDtcclxuICAgICAgcmVnbFRleHR1cmVDdWJlLmhlaWdodCA9IGZhY2VzWzBdLmhlaWdodDtcclxuXHJcbiAgICAgIHRlbXBCaW5kKHRleHR1cmUpO1xyXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XHJcbiAgICAgICAgc2V0TWlwTWFwKGZhY2VzW2ldLCBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1gkMSArIGkpO1xyXG4gICAgICB9XHJcbiAgICAgIHNldFRleEluZm8odGV4SW5mbywgR0xfVEVYVFVSRV9DVUJFX01BUCQxKTtcclxuICAgICAgdGVtcFJlc3RvcmUoKTtcclxuXHJcbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xyXG4gICAgICAgIHRleHR1cmUuc3RhdHMuc2l6ZSA9IGdldFRleHR1cmVTaXplKFxyXG4gICAgICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCxcclxuICAgICAgICAgIHRleHR1cmUudHlwZSxcclxuICAgICAgICAgIHJlZ2xUZXh0dXJlQ3ViZS53aWR0aCxcclxuICAgICAgICAgIHJlZ2xUZXh0dXJlQ3ViZS5oZWlnaHQsXHJcbiAgICAgICAgICB0ZXhJbmZvLmdlbk1pcG1hcHMsXHJcbiAgICAgICAgICB0cnVlKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgcmVnbFRleHR1cmVDdWJlLmZvcm1hdCA9IHRleHR1cmVGb3JtYXRzSW52ZXJ0W3RleHR1cmUuaW50ZXJuYWxmb3JtYXRdO1xyXG4gICAgICByZWdsVGV4dHVyZUN1YmUudHlwZSA9IHRleHR1cmVUeXBlc0ludmVydFt0ZXh0dXJlLnR5cGVdO1xyXG5cclxuICAgICAgcmVnbFRleHR1cmVDdWJlLm1hZyA9IG1hZ0ZpbHRlcnNJbnZlcnRbdGV4SW5mby5tYWdGaWx0ZXJdO1xyXG4gICAgICByZWdsVGV4dHVyZUN1YmUubWluID0gbWluRmlsdGVyc0ludmVydFt0ZXhJbmZvLm1pbkZpbHRlcl07XHJcblxyXG4gICAgICByZWdsVGV4dHVyZUN1YmUud3JhcFMgPSB3cmFwTW9kZXNJbnZlcnRbdGV4SW5mby53cmFwU107XHJcbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS53cmFwVCA9IHdyYXBNb2Rlc0ludmVydFt0ZXhJbmZvLndyYXBUXTtcclxuXHJcbiAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcclxuICAgICAgICBmcmVlTWlwTWFwKGZhY2VzW2ldKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlQ3ViZVxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHN1YmltYWdlIChmYWNlLCBpbWFnZSwgeF8sIHlfLCBsZXZlbF8pIHtcclxuICAgICAgY2hlY2skMSghIWltYWdlLCAnbXVzdCBzcGVjaWZ5IGltYWdlIGRhdGEnKTtcclxuICAgICAgY2hlY2skMSh0eXBlb2YgZmFjZSA9PT0gJ251bWJlcicgJiYgZmFjZSA9PT0gKGZhY2UgfCAwKSAmJlxyXG4gICAgICAgIGZhY2UgPj0gMCAmJiBmYWNlIDwgNiwgJ2ludmFsaWQgZmFjZScpO1xyXG5cclxuICAgICAgdmFyIHggPSB4XyB8IDA7XHJcbiAgICAgIHZhciB5ID0geV8gfCAwO1xyXG4gICAgICB2YXIgbGV2ZWwgPSBsZXZlbF8gfCAwO1xyXG5cclxuICAgICAgdmFyIGltYWdlRGF0YSA9IGFsbG9jSW1hZ2UoKTtcclxuICAgICAgY29weUZsYWdzKGltYWdlRGF0YSwgdGV4dHVyZSk7XHJcbiAgICAgIGltYWdlRGF0YS53aWR0aCA9IDA7XHJcbiAgICAgIGltYWdlRGF0YS5oZWlnaHQgPSAwO1xyXG4gICAgICBwYXJzZUltYWdlKGltYWdlRGF0YSwgaW1hZ2UpO1xyXG4gICAgICBpbWFnZURhdGEud2lkdGggPSBpbWFnZURhdGEud2lkdGggfHwgKCh0ZXh0dXJlLndpZHRoID4+IGxldmVsKSAtIHgpO1xyXG4gICAgICBpbWFnZURhdGEuaGVpZ2h0ID0gaW1hZ2VEYXRhLmhlaWdodCB8fCAoKHRleHR1cmUuaGVpZ2h0ID4+IGxldmVsKSAtIHkpO1xyXG5cclxuICAgICAgY2hlY2skMShcclxuICAgICAgICB0ZXh0dXJlLnR5cGUgPT09IGltYWdlRGF0YS50eXBlICYmXHJcbiAgICAgICAgdGV4dHVyZS5mb3JtYXQgPT09IGltYWdlRGF0YS5mb3JtYXQgJiZcclxuICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0ID09PSBpbWFnZURhdGEuaW50ZXJuYWxmb3JtYXQsXHJcbiAgICAgICAgJ2luY29tcGF0aWJsZSBmb3JtYXQgZm9yIHRleHR1cmUuc3ViaW1hZ2UnKTtcclxuICAgICAgY2hlY2skMShcclxuICAgICAgICB4ID49IDAgJiYgeSA+PSAwICYmXHJcbiAgICAgICAgeCArIGltYWdlRGF0YS53aWR0aCA8PSB0ZXh0dXJlLndpZHRoICYmXHJcbiAgICAgICAgeSArIGltYWdlRGF0YS5oZWlnaHQgPD0gdGV4dHVyZS5oZWlnaHQsXHJcbiAgICAgICAgJ3RleHR1cmUuc3ViaW1hZ2Ugd3JpdGUgb3V0IG9mIGJvdW5kcycpO1xyXG4gICAgICBjaGVjayQxKFxyXG4gICAgICAgIHRleHR1cmUubWlwbWFzayAmICgxIDw8IGxldmVsKSxcclxuICAgICAgICAnbWlzc2luZyBtaXBtYXAgZGF0YScpO1xyXG4gICAgICBjaGVjayQxKFxyXG4gICAgICAgIGltYWdlRGF0YS5kYXRhIHx8IGltYWdlRGF0YS5lbGVtZW50IHx8IGltYWdlRGF0YS5uZWVkc0NvcHksXHJcbiAgICAgICAgJ21pc3NpbmcgaW1hZ2UgZGF0YScpO1xyXG5cclxuICAgICAgdGVtcEJpbmQodGV4dHVyZSk7XHJcbiAgICAgIHNldFN1YkltYWdlKGltYWdlRGF0YSwgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YJDEgKyBmYWNlLCB4LCB5LCBsZXZlbCk7XHJcbiAgICAgIHRlbXBSZXN0b3JlKCk7XHJcblxyXG4gICAgICBmcmVlSW1hZ2UoaW1hZ2VEYXRhKTtcclxuXHJcbiAgICAgIHJldHVybiByZWdsVGV4dHVyZUN1YmVcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiByZXNpemUgKHJhZGl1c18pIHtcclxuICAgICAgdmFyIHJhZGl1cyA9IHJhZGl1c18gfCAwO1xyXG4gICAgICBpZiAocmFkaXVzID09PSB0ZXh0dXJlLndpZHRoKSB7XHJcbiAgICAgICAgcmV0dXJuXHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS53aWR0aCA9IHRleHR1cmUud2lkdGggPSByYWRpdXM7XHJcbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS5oZWlnaHQgPSB0ZXh0dXJlLmhlaWdodCA9IHJhZGl1cztcclxuXHJcbiAgICAgIHRlbXBCaW5kKHRleHR1cmUpO1xyXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IDY7ICsraSkge1xyXG4gICAgICAgIGZvciAodmFyIGogPSAwOyB0ZXh0dXJlLm1pcG1hc2sgPj4gajsgKytqKSB7XHJcbiAgICAgICAgICBnbC50ZXhJbWFnZTJEKFxyXG4gICAgICAgICAgICBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1gkMSArIGksXHJcbiAgICAgICAgICAgIGosXHJcbiAgICAgICAgICAgIHRleHR1cmUuZm9ybWF0LFxyXG4gICAgICAgICAgICByYWRpdXMgPj4gaixcclxuICAgICAgICAgICAgcmFkaXVzID4+IGosXHJcbiAgICAgICAgICAgIDAsXHJcbiAgICAgICAgICAgIHRleHR1cmUuZm9ybWF0LFxyXG4gICAgICAgICAgICB0ZXh0dXJlLnR5cGUsXHJcbiAgICAgICAgICAgIG51bGwpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICB0ZW1wUmVzdG9yZSgpO1xyXG5cclxuICAgICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XHJcbiAgICAgICAgdGV4dHVyZS5zdGF0cy5zaXplID0gZ2V0VGV4dHVyZVNpemUoXHJcbiAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxyXG4gICAgICAgICAgdGV4dHVyZS50eXBlLFxyXG4gICAgICAgICAgcmVnbFRleHR1cmVDdWJlLndpZHRoLFxyXG4gICAgICAgICAgcmVnbFRleHR1cmVDdWJlLmhlaWdodCxcclxuICAgICAgICAgIGZhbHNlLFxyXG4gICAgICAgICAgdHJ1ZSk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiByZWdsVGV4dHVyZUN1YmVcclxuICAgIH1cclxuXHJcbiAgICByZWdsVGV4dHVyZUN1YmUoYTAsIGExLCBhMiwgYTMsIGE0LCBhNSk7XHJcblxyXG4gICAgcmVnbFRleHR1cmVDdWJlLnN1YmltYWdlID0gc3ViaW1hZ2U7XHJcbiAgICByZWdsVGV4dHVyZUN1YmUucmVzaXplID0gcmVzaXplO1xyXG4gICAgcmVnbFRleHR1cmVDdWJlLl9yZWdsVHlwZSA9ICd0ZXh0dXJlQ3ViZSc7XHJcbiAgICByZWdsVGV4dHVyZUN1YmUuX3RleHR1cmUgPSB0ZXh0dXJlO1xyXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XHJcbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS5zdGF0cyA9IHRleHR1cmUuc3RhdHM7XHJcbiAgICB9XHJcbiAgICByZWdsVGV4dHVyZUN1YmUuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcclxuICAgICAgdGV4dHVyZS5kZWNSZWYoKTtcclxuICAgIH07XHJcblxyXG4gICAgcmV0dXJuIHJlZ2xUZXh0dXJlQ3ViZVxyXG4gIH1cclxuXHJcbiAgLy8gQ2FsbGVkIHdoZW4gcmVnbCBpcyBkZXN0cm95ZWRcclxuICBmdW5jdGlvbiBkZXN0cm95VGV4dHVyZXMgKCkge1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1UZXhVbml0czsgKytpKSB7XHJcbiAgICAgIGdsLmFjdGl2ZVRleHR1cmUoR0xfVEVYVFVSRTAkMSArIGkpO1xyXG4gICAgICBnbC5iaW5kVGV4dHVyZShHTF9URVhUVVJFXzJEJDEsIG51bGwpO1xyXG4gICAgICB0ZXh0dXJlVW5pdHNbaV0gPSBudWxsO1xyXG4gICAgfVxyXG4gICAgdmFsdWVzKHRleHR1cmVTZXQpLmZvckVhY2goZGVzdHJveSk7XHJcblxyXG4gICAgc3RhdHMuY3ViZUNvdW50ID0gMDtcclxuICAgIHN0YXRzLnRleHR1cmVDb3VudCA9IDA7XHJcbiAgfVxyXG5cclxuICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcclxuICAgIHN0YXRzLmdldFRvdGFsVGV4dHVyZVNpemUgPSBmdW5jdGlvbiAoKSB7XHJcbiAgICAgIHZhciB0b3RhbCA9IDA7XHJcbiAgICAgIE9iamVjdC5rZXlzKHRleHR1cmVTZXQpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xyXG4gICAgICAgIHRvdGFsICs9IHRleHR1cmVTZXRba2V5XS5zdGF0cy5zaXplO1xyXG4gICAgICB9KTtcclxuICAgICAgcmV0dXJuIHRvdGFsXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gcmVzdG9yZVRleHR1cmVzICgpIHtcclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbnVtVGV4VW5pdHM7ICsraSkge1xyXG4gICAgICB2YXIgdGV4ID0gdGV4dHVyZVVuaXRzW2ldO1xyXG4gICAgICBpZiAodGV4KSB7XHJcbiAgICAgICAgdGV4LmJpbmRDb3VudCA9IDA7XHJcbiAgICAgICAgdGV4LnVuaXQgPSAtMTtcclxuICAgICAgICB0ZXh0dXJlVW5pdHNbaV0gPSBudWxsO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdmFsdWVzKHRleHR1cmVTZXQpLmZvckVhY2goZnVuY3Rpb24gKHRleHR1cmUpIHtcclxuICAgICAgdGV4dHVyZS50ZXh0dXJlID0gZ2wuY3JlYXRlVGV4dHVyZSgpO1xyXG4gICAgICBnbC5iaW5kVGV4dHVyZSh0ZXh0dXJlLnRhcmdldCwgdGV4dHVyZS50ZXh0dXJlKTtcclxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCAzMjsgKytpKSB7XHJcbiAgICAgICAgaWYgKCh0ZXh0dXJlLm1pcG1hc2sgJiAoMSA8PCBpKSkgPT09IDApIHtcclxuICAgICAgICAgIGNvbnRpbnVlXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0ZXh0dXJlLnRhcmdldCA9PT0gR0xfVEVYVFVSRV8yRCQxKSB7XHJcbiAgICAgICAgICBnbC50ZXhJbWFnZTJEKEdMX1RFWFRVUkVfMkQkMSxcclxuICAgICAgICAgICAgaSxcclxuICAgICAgICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCxcclxuICAgICAgICAgICAgdGV4dHVyZS53aWR0aCA+PiBpLFxyXG4gICAgICAgICAgICB0ZXh0dXJlLmhlaWdodCA+PiBpLFxyXG4gICAgICAgICAgICAwLFxyXG4gICAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxyXG4gICAgICAgICAgICB0ZXh0dXJlLnR5cGUsXHJcbiAgICAgICAgICAgIG51bGwpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IDY7ICsraikge1xyXG4gICAgICAgICAgICBnbC50ZXhJbWFnZTJEKEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCQxICsgaixcclxuICAgICAgICAgICAgICBpLFxyXG4gICAgICAgICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQsXHJcbiAgICAgICAgICAgICAgdGV4dHVyZS53aWR0aCA+PiBpLFxyXG4gICAgICAgICAgICAgIHRleHR1cmUuaGVpZ2h0ID4+IGksXHJcbiAgICAgICAgICAgICAgMCxcclxuICAgICAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxyXG4gICAgICAgICAgICAgIHRleHR1cmUudHlwZSxcclxuICAgICAgICAgICAgICBudWxsKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgc2V0VGV4SW5mbyh0ZXh0dXJlLnRleEluZm8sIHRleHR1cmUudGFyZ2V0KTtcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIGNyZWF0ZTJEOiBjcmVhdGVUZXh0dXJlMkQsXHJcbiAgICBjcmVhdGVDdWJlOiBjcmVhdGVUZXh0dXJlQ3ViZSxcclxuICAgIGNsZWFyOiBkZXN0cm95VGV4dHVyZXMsXHJcbiAgICBnZXRUZXh0dXJlOiBmdW5jdGlvbiAod3JhcHBlcikge1xyXG4gICAgICByZXR1cm4gbnVsbFxyXG4gICAgfSxcclxuICAgIHJlc3RvcmU6IHJlc3RvcmVUZXh0dXJlc1xyXG4gIH1cclxufVxuXG52YXIgR0xfUkVOREVSQlVGRkVSID0gMHg4RDQxO1xyXG5cclxudmFyIEdMX1JHQkE0JDEgPSAweDgwNTY7XHJcbnZhciBHTF9SR0I1X0ExJDEgPSAweDgwNTc7XHJcbnZhciBHTF9SR0I1NjUkMSA9IDB4OEQ2MjtcclxudmFyIEdMX0RFUFRIX0NPTVBPTkVOVDE2ID0gMHg4MUE1O1xyXG52YXIgR0xfU1RFTkNJTF9JTkRFWDggPSAweDhENDg7XHJcbnZhciBHTF9ERVBUSF9TVEVOQ0lMJDEgPSAweDg0Rjk7XHJcblxyXG52YXIgR0xfU1JHQjhfQUxQSEE4X0VYVCA9IDB4OEM0MztcclxuXHJcbnZhciBHTF9SR0JBMzJGX0VYVCA9IDB4ODgxNDtcclxuXHJcbnZhciBHTF9SR0JBMTZGX0VYVCA9IDB4ODgxQTtcclxudmFyIEdMX1JHQjE2Rl9FWFQgPSAweDg4MUI7XHJcblxyXG52YXIgRk9STUFUX1NJWkVTID0gW107XHJcblxyXG5GT1JNQVRfU0laRVNbR0xfUkdCQTQkMV0gPSAyO1xyXG5GT1JNQVRfU0laRVNbR0xfUkdCNV9BMSQxXSA9IDI7XHJcbkZPUk1BVF9TSVpFU1tHTF9SR0I1NjUkMV0gPSAyO1xyXG5cclxuRk9STUFUX1NJWkVTW0dMX0RFUFRIX0NPTVBPTkVOVDE2XSA9IDI7XHJcbkZPUk1BVF9TSVpFU1tHTF9TVEVOQ0lMX0lOREVYOF0gPSAxO1xyXG5GT1JNQVRfU0laRVNbR0xfREVQVEhfU1RFTkNJTCQxXSA9IDQ7XHJcblxyXG5GT1JNQVRfU0laRVNbR0xfU1JHQjhfQUxQSEE4X0VYVF0gPSA0O1xyXG5GT1JNQVRfU0laRVNbR0xfUkdCQTMyRl9FWFRdID0gMTY7XHJcbkZPUk1BVF9TSVpFU1tHTF9SR0JBMTZGX0VYVF0gPSA4O1xyXG5GT1JNQVRfU0laRVNbR0xfUkdCMTZGX0VYVF0gPSA2O1xyXG5cclxuZnVuY3Rpb24gZ2V0UmVuZGVyYnVmZmVyU2l6ZSAoZm9ybWF0LCB3aWR0aCwgaGVpZ2h0KSB7XHJcbiAgcmV0dXJuIEZPUk1BVF9TSVpFU1tmb3JtYXRdICogd2lkdGggKiBoZWlnaHRcclxufVxyXG5cclxudmFyIHdyYXBSZW5kZXJidWZmZXJzID0gZnVuY3Rpb24gKGdsLCBleHRlbnNpb25zLCBsaW1pdHMsIHN0YXRzLCBjb25maWcpIHtcclxuICB2YXIgZm9ybWF0VHlwZXMgPSB7XHJcbiAgICAncmdiYTQnOiBHTF9SR0JBNCQxLFxyXG4gICAgJ3JnYjU2NSc6IEdMX1JHQjU2NSQxLFxyXG4gICAgJ3JnYjUgYTEnOiBHTF9SR0I1X0ExJDEsXHJcbiAgICAnZGVwdGgnOiBHTF9ERVBUSF9DT01QT05FTlQxNixcclxuICAgICdzdGVuY2lsJzogR0xfU1RFTkNJTF9JTkRFWDgsXHJcbiAgICAnZGVwdGggc3RlbmNpbCc6IEdMX0RFUFRIX1NURU5DSUwkMVxyXG4gIH07XHJcblxyXG4gIGlmIChleHRlbnNpb25zLmV4dF9zcmdiKSB7XHJcbiAgICBmb3JtYXRUeXBlc1snc3JnYmEnXSA9IEdMX1NSR0I4X0FMUEhBOF9FWFQ7XHJcbiAgfVxyXG5cclxuICBpZiAoZXh0ZW5zaW9ucy5leHRfY29sb3JfYnVmZmVyX2hhbGZfZmxvYXQpIHtcclxuICAgIGZvcm1hdFR5cGVzWydyZ2JhMTZmJ10gPSBHTF9SR0JBMTZGX0VYVDtcclxuICAgIGZvcm1hdFR5cGVzWydyZ2IxNmYnXSA9IEdMX1JHQjE2Rl9FWFQ7XHJcbiAgfVxyXG5cclxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb2xvcl9idWZmZXJfZmxvYXQpIHtcclxuICAgIGZvcm1hdFR5cGVzWydyZ2JhMzJmJ10gPSBHTF9SR0JBMzJGX0VYVDtcclxuICB9XHJcblxyXG4gIHZhciBmb3JtYXRUeXBlc0ludmVydCA9IFtdO1xyXG4gIE9iamVjdC5rZXlzKGZvcm1hdFR5cGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcclxuICAgIHZhciB2YWwgPSBmb3JtYXRUeXBlc1trZXldO1xyXG4gICAgZm9ybWF0VHlwZXNJbnZlcnRbdmFsXSA9IGtleTtcclxuICB9KTtcclxuXHJcbiAgdmFyIHJlbmRlcmJ1ZmZlckNvdW50ID0gMDtcclxuICB2YXIgcmVuZGVyYnVmZmVyU2V0ID0ge307XHJcblxyXG4gIGZ1bmN0aW9uIFJFR0xSZW5kZXJidWZmZXIgKHJlbmRlcmJ1ZmZlcikge1xyXG4gICAgdGhpcy5pZCA9IHJlbmRlcmJ1ZmZlckNvdW50Kys7XHJcbiAgICB0aGlzLnJlZkNvdW50ID0gMTtcclxuXHJcbiAgICB0aGlzLnJlbmRlcmJ1ZmZlciA9IHJlbmRlcmJ1ZmZlcjtcclxuXHJcbiAgICB0aGlzLmZvcm1hdCA9IEdMX1JHQkE0JDE7XHJcbiAgICB0aGlzLndpZHRoID0gMDtcclxuICAgIHRoaXMuaGVpZ2h0ID0gMDtcclxuXHJcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcclxuICAgICAgdGhpcy5zdGF0cyA9IHtzaXplOiAwfTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIFJFR0xSZW5kZXJidWZmZXIucHJvdG90eXBlLmRlY1JlZiA9IGZ1bmN0aW9uICgpIHtcclxuICAgIGlmICgtLXRoaXMucmVmQ291bnQgPD0gMCkge1xyXG4gICAgICBkZXN0cm95KHRoaXMpO1xyXG4gICAgfVxyXG4gIH07XHJcblxyXG4gIGZ1bmN0aW9uIGRlc3Ryb3kgKHJiKSB7XHJcbiAgICB2YXIgaGFuZGxlID0gcmIucmVuZGVyYnVmZmVyO1xyXG4gICAgY2hlY2skMShoYW5kbGUsICdtdXN0IG5vdCBkb3VibGUgZGVzdHJveSByZW5kZXJidWZmZXInKTtcclxuICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoR0xfUkVOREVSQlVGRkVSLCBudWxsKTtcclxuICAgIGdsLmRlbGV0ZVJlbmRlcmJ1ZmZlcihoYW5kbGUpO1xyXG4gICAgcmIucmVuZGVyYnVmZmVyID0gbnVsbDtcclxuICAgIHJiLnJlZkNvdW50ID0gMDtcclxuICAgIGRlbGV0ZSByZW5kZXJidWZmZXJTZXRbcmIuaWRdO1xyXG4gICAgc3RhdHMucmVuZGVyYnVmZmVyQ291bnQtLTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGNyZWF0ZVJlbmRlcmJ1ZmZlciAoYSwgYikge1xyXG4gICAgdmFyIHJlbmRlcmJ1ZmZlciA9IG5ldyBSRUdMUmVuZGVyYnVmZmVyKGdsLmNyZWF0ZVJlbmRlcmJ1ZmZlcigpKTtcclxuICAgIHJlbmRlcmJ1ZmZlclNldFtyZW5kZXJidWZmZXIuaWRdID0gcmVuZGVyYnVmZmVyO1xyXG4gICAgc3RhdHMucmVuZGVyYnVmZmVyQ291bnQrKztcclxuXHJcbiAgICBmdW5jdGlvbiByZWdsUmVuZGVyYnVmZmVyIChhLCBiKSB7XHJcbiAgICAgIHZhciB3ID0gMDtcclxuICAgICAgdmFyIGggPSAwO1xyXG4gICAgICB2YXIgZm9ybWF0ID0gR0xfUkdCQTQkMTtcclxuXHJcbiAgICAgIGlmICh0eXBlb2YgYSA9PT0gJ29iamVjdCcgJiYgYSkge1xyXG4gICAgICAgIHZhciBvcHRpb25zID0gYTtcclxuICAgICAgICBpZiAoJ3NoYXBlJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgICB2YXIgc2hhcGUgPSBvcHRpb25zLnNoYXBlO1xyXG4gICAgICAgICAgY2hlY2skMShBcnJheS5pc0FycmF5KHNoYXBlKSAmJiBzaGFwZS5sZW5ndGggPj0gMixcclxuICAgICAgICAgICAgJ2ludmFsaWQgcmVuZGVyYnVmZmVyIHNoYXBlJyk7XHJcbiAgICAgICAgICB3ID0gc2hhcGVbMF0gfCAwO1xyXG4gICAgICAgICAgaCA9IHNoYXBlWzFdIHwgMDtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgaWYgKCdyYWRpdXMnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgICAgdyA9IGggPSBvcHRpb25zLnJhZGl1cyB8IDA7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBpZiAoJ3dpZHRoJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgICAgIHcgPSBvcHRpb25zLndpZHRoIHwgMDtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGlmICgnaGVpZ2h0JyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgICAgIGggPSBvcHRpb25zLmhlaWdodCB8IDA7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICgnZm9ybWF0JyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgICBjaGVjayQxLnBhcmFtZXRlcihvcHRpb25zLmZvcm1hdCwgZm9ybWF0VHlwZXMsXHJcbiAgICAgICAgICAgICdpbnZhbGlkIHJlbmRlcmJ1ZmZlciBmb3JtYXQnKTtcclxuICAgICAgICAgIGZvcm1hdCA9IGZvcm1hdFR5cGVzW29wdGlvbnMuZm9ybWF0XTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGEgPT09ICdudW1iZXInKSB7XHJcbiAgICAgICAgdyA9IGEgfCAwO1xyXG4gICAgICAgIGlmICh0eXBlb2YgYiA9PT0gJ251bWJlcicpIHtcclxuICAgICAgICAgIGggPSBiIHwgMDtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgaCA9IHc7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2UgaWYgKCFhKSB7XHJcbiAgICAgICAgdyA9IGggPSAxO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNoZWNrJDEucmFpc2UoJ2ludmFsaWQgYXJndW1lbnRzIHRvIHJlbmRlcmJ1ZmZlciBjb25zdHJ1Y3RvcicpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBjaGVjayBzaGFwZVxyXG4gICAgICBjaGVjayQxKFxyXG4gICAgICAgIHcgPiAwICYmIGggPiAwICYmXHJcbiAgICAgICAgdyA8PSBsaW1pdHMubWF4UmVuZGVyYnVmZmVyU2l6ZSAmJiBoIDw9IGxpbWl0cy5tYXhSZW5kZXJidWZmZXJTaXplLFxyXG4gICAgICAgICdpbnZhbGlkIHJlbmRlcmJ1ZmZlciBzaXplJyk7XHJcblxyXG4gICAgICBpZiAodyA9PT0gcmVuZGVyYnVmZmVyLndpZHRoICYmXHJcbiAgICAgICAgICBoID09PSByZW5kZXJidWZmZXIuaGVpZ2h0ICYmXHJcbiAgICAgICAgICBmb3JtYXQgPT09IHJlbmRlcmJ1ZmZlci5mb3JtYXQpIHtcclxuICAgICAgICByZXR1cm5cclxuICAgICAgfVxyXG5cclxuICAgICAgcmVnbFJlbmRlcmJ1ZmZlci53aWR0aCA9IHJlbmRlcmJ1ZmZlci53aWR0aCA9IHc7XHJcbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIuaGVpZ2h0ID0gcmVuZGVyYnVmZmVyLmhlaWdodCA9IGg7XHJcbiAgICAgIHJlbmRlcmJ1ZmZlci5mb3JtYXQgPSBmb3JtYXQ7XHJcblxyXG4gICAgICBnbC5iaW5kUmVuZGVyYnVmZmVyKEdMX1JFTkRFUkJVRkZFUiwgcmVuZGVyYnVmZmVyLnJlbmRlcmJ1ZmZlcik7XHJcbiAgICAgIGdsLnJlbmRlcmJ1ZmZlclN0b3JhZ2UoR0xfUkVOREVSQlVGRkVSLCBmb3JtYXQsIHcsIGgpO1xyXG5cclxuICAgICAgY2hlY2skMShcclxuICAgICAgICBnbC5nZXRFcnJvcigpID09PSAwLFxyXG4gICAgICAgICdpbnZhbGlkIHJlbmRlciBidWZmZXIgZm9ybWF0Jyk7XHJcblxyXG4gICAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcclxuICAgICAgICByZW5kZXJidWZmZXIuc3RhdHMuc2l6ZSA9IGdldFJlbmRlcmJ1ZmZlclNpemUocmVuZGVyYnVmZmVyLmZvcm1hdCwgcmVuZGVyYnVmZmVyLndpZHRoLCByZW5kZXJidWZmZXIuaGVpZ2h0KTtcclxuICAgICAgfVxyXG4gICAgICByZWdsUmVuZGVyYnVmZmVyLmZvcm1hdCA9IGZvcm1hdFR5cGVzSW52ZXJ0W3JlbmRlcmJ1ZmZlci5mb3JtYXRdO1xyXG5cclxuICAgICAgcmV0dXJuIHJlZ2xSZW5kZXJidWZmZXJcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiByZXNpemUgKHdfLCBoXykge1xyXG4gICAgICB2YXIgdyA9IHdfIHwgMDtcclxuICAgICAgdmFyIGggPSAoaF8gfCAwKSB8fCB3O1xyXG5cclxuICAgICAgaWYgKHcgPT09IHJlbmRlcmJ1ZmZlci53aWR0aCAmJiBoID09PSByZW5kZXJidWZmZXIuaGVpZ2h0KSB7XHJcbiAgICAgICAgcmV0dXJuIHJlZ2xSZW5kZXJidWZmZXJcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gY2hlY2sgc2hhcGVcclxuICAgICAgY2hlY2skMShcclxuICAgICAgICB3ID4gMCAmJiBoID4gMCAmJlxyXG4gICAgICAgIHcgPD0gbGltaXRzLm1heFJlbmRlcmJ1ZmZlclNpemUgJiYgaCA8PSBsaW1pdHMubWF4UmVuZGVyYnVmZmVyU2l6ZSxcclxuICAgICAgICAnaW52YWxpZCByZW5kZXJidWZmZXIgc2l6ZScpO1xyXG5cclxuICAgICAgcmVnbFJlbmRlcmJ1ZmZlci53aWR0aCA9IHJlbmRlcmJ1ZmZlci53aWR0aCA9IHc7XHJcbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIuaGVpZ2h0ID0gcmVuZGVyYnVmZmVyLmhlaWdodCA9IGg7XHJcblxyXG4gICAgICBnbC5iaW5kUmVuZGVyYnVmZmVyKEdMX1JFTkRFUkJVRkZFUiwgcmVuZGVyYnVmZmVyLnJlbmRlcmJ1ZmZlcik7XHJcbiAgICAgIGdsLnJlbmRlcmJ1ZmZlclN0b3JhZ2UoR0xfUkVOREVSQlVGRkVSLCByZW5kZXJidWZmZXIuZm9ybWF0LCB3LCBoKTtcclxuXHJcbiAgICAgIGNoZWNrJDEoXHJcbiAgICAgICAgZ2wuZ2V0RXJyb3IoKSA9PT0gMCxcclxuICAgICAgICAnaW52YWxpZCByZW5kZXIgYnVmZmVyIGZvcm1hdCcpO1xyXG5cclxuICAgICAgLy8gYWxzbywgcmVjb21wdXRlIHNpemUuXHJcbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xyXG4gICAgICAgIHJlbmRlcmJ1ZmZlci5zdGF0cy5zaXplID0gZ2V0UmVuZGVyYnVmZmVyU2l6ZShcclxuICAgICAgICAgIHJlbmRlcmJ1ZmZlci5mb3JtYXQsIHJlbmRlcmJ1ZmZlci53aWR0aCwgcmVuZGVyYnVmZmVyLmhlaWdodCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiByZWdsUmVuZGVyYnVmZmVyXHJcbiAgICB9XHJcblxyXG4gICAgcmVnbFJlbmRlcmJ1ZmZlcihhLCBiKTtcclxuXHJcbiAgICByZWdsUmVuZGVyYnVmZmVyLnJlc2l6ZSA9IHJlc2l6ZTtcclxuICAgIHJlZ2xSZW5kZXJidWZmZXIuX3JlZ2xUeXBlID0gJ3JlbmRlcmJ1ZmZlcic7XHJcbiAgICByZWdsUmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIgPSByZW5kZXJidWZmZXI7XHJcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcclxuICAgICAgcmVnbFJlbmRlcmJ1ZmZlci5zdGF0cyA9IHJlbmRlcmJ1ZmZlci5zdGF0cztcclxuICAgIH1cclxuICAgIHJlZ2xSZW5kZXJidWZmZXIuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcclxuICAgICAgcmVuZGVyYnVmZmVyLmRlY1JlZigpO1xyXG4gICAgfTtcclxuXHJcbiAgICByZXR1cm4gcmVnbFJlbmRlcmJ1ZmZlclxyXG4gIH1cclxuXHJcbiAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XHJcbiAgICBzdGF0cy5nZXRUb3RhbFJlbmRlcmJ1ZmZlclNpemUgPSBmdW5jdGlvbiAoKSB7XHJcbiAgICAgIHZhciB0b3RhbCA9IDA7XHJcbiAgICAgIE9iamVjdC5rZXlzKHJlbmRlcmJ1ZmZlclNldCkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XHJcbiAgICAgICAgdG90YWwgKz0gcmVuZGVyYnVmZmVyU2V0W2tleV0uc3RhdHMuc2l6ZTtcclxuICAgICAgfSk7XHJcbiAgICAgIHJldHVybiB0b3RhbFxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHJlc3RvcmVSZW5kZXJidWZmZXJzICgpIHtcclxuICAgIHZhbHVlcyhyZW5kZXJidWZmZXJTZXQpLmZvckVhY2goZnVuY3Rpb24gKHJiKSB7XHJcbiAgICAgIHJiLnJlbmRlcmJ1ZmZlciA9IGdsLmNyZWF0ZVJlbmRlcmJ1ZmZlcigpO1xyXG4gICAgICBnbC5iaW5kUmVuZGVyYnVmZmVyKEdMX1JFTkRFUkJVRkZFUiwgcmIucmVuZGVyYnVmZmVyKTtcclxuICAgICAgZ2wucmVuZGVyYnVmZmVyU3RvcmFnZShHTF9SRU5ERVJCVUZGRVIsIHJiLmZvcm1hdCwgcmIud2lkdGgsIHJiLmhlaWdodCk7XHJcbiAgICB9KTtcclxuICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoR0xfUkVOREVSQlVGRkVSLCBudWxsKTtcclxuICB9XHJcblxyXG4gIHJldHVybiB7XHJcbiAgICBjcmVhdGU6IGNyZWF0ZVJlbmRlcmJ1ZmZlcixcclxuICAgIGNsZWFyOiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgIHZhbHVlcyhyZW5kZXJidWZmZXJTZXQpLmZvckVhY2goZGVzdHJveSk7XHJcbiAgICB9LFxyXG4gICAgcmVzdG9yZTogcmVzdG9yZVJlbmRlcmJ1ZmZlcnNcclxuICB9XHJcbn07XG5cbi8vIFdlIHN0b3JlIHRoZXNlIGNvbnN0YW50cyBzbyB0aGF0IHRoZSBtaW5pZmllciBjYW4gaW5saW5lIHRoZW1cclxudmFyIEdMX0ZSQU1FQlVGRkVSJDEgPSAweDhENDA7XHJcbnZhciBHTF9SRU5ERVJCVUZGRVIkMSA9IDB4OEQ0MTtcclxuXHJcbnZhciBHTF9URVhUVVJFXzJEJDIgPSAweDBERTE7XHJcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1gkMiA9IDB4ODUxNTtcclxuXHJcbnZhciBHTF9DT0xPUl9BVFRBQ0hNRU5UMCQxID0gMHg4Q0UwO1xyXG52YXIgR0xfREVQVEhfQVRUQUNITUVOVCA9IDB4OEQwMDtcclxudmFyIEdMX1NURU5DSUxfQVRUQUNITUVOVCA9IDB4OEQyMDtcclxudmFyIEdMX0RFUFRIX1NURU5DSUxfQVRUQUNITUVOVCA9IDB4ODIxQTtcclxuXHJcbnZhciBHTF9GUkFNRUJVRkZFUl9DT01QTEVURSQxID0gMHg4Q0Q1O1xyXG52YXIgR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9BVFRBQ0hNRU5UID0gMHg4Q0Q2O1xyXG52YXIgR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9NSVNTSU5HX0FUVEFDSE1FTlQgPSAweDhDRDc7XHJcbnZhciBHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0RJTUVOU0lPTlMgPSAweDhDRDk7XHJcbnZhciBHTF9GUkFNRUJVRkZFUl9VTlNVUFBPUlRFRCA9IDB4OENERDtcclxuXHJcbnZhciBHTF9IQUxGX0ZMT0FUX09FUyQyID0gMHg4RDYxO1xyXG52YXIgR0xfVU5TSUdORURfQllURSQ2ID0gMHgxNDAxO1xyXG52YXIgR0xfRkxPQVQkNSA9IDB4MTQwNjtcclxuXHJcbnZhciBHTF9SR0IkMSA9IDB4MTkwNztcclxudmFyIEdMX1JHQkEkMiA9IDB4MTkwODtcclxuXHJcbnZhciBHTF9ERVBUSF9DT01QT05FTlQkMSA9IDB4MTkwMjtcclxuXHJcbnZhciBjb2xvclRleHR1cmVGb3JtYXRFbnVtcyA9IFtcclxuICBHTF9SR0IkMSxcclxuICBHTF9SR0JBJDJcclxuXTtcclxuXHJcbi8vIGZvciBldmVyeSB0ZXh0dXJlIGZvcm1hdCwgc3RvcmVcclxuLy8gdGhlIG51bWJlciBvZiBjaGFubmVsc1xyXG52YXIgdGV4dHVyZUZvcm1hdENoYW5uZWxzID0gW107XHJcbnRleHR1cmVGb3JtYXRDaGFubmVsc1tHTF9SR0JBJDJdID0gNDtcclxudGV4dHVyZUZvcm1hdENoYW5uZWxzW0dMX1JHQiQxXSA9IDM7XHJcblxyXG4vLyBmb3IgZXZlcnkgdGV4dHVyZSB0eXBlLCBzdG9yZVxyXG4vLyB0aGUgc2l6ZSBpbiBieXRlcy5cclxudmFyIHRleHR1cmVUeXBlU2l6ZXMgPSBbXTtcclxudGV4dHVyZVR5cGVTaXplc1tHTF9VTlNJR05FRF9CWVRFJDZdID0gMTtcclxudGV4dHVyZVR5cGVTaXplc1tHTF9GTE9BVCQ1XSA9IDQ7XHJcbnRleHR1cmVUeXBlU2l6ZXNbR0xfSEFMRl9GTE9BVF9PRVMkMl0gPSAyO1xyXG5cclxudmFyIEdMX1JHQkE0JDIgPSAweDgwNTY7XHJcbnZhciBHTF9SR0I1X0ExJDIgPSAweDgwNTc7XHJcbnZhciBHTF9SR0I1NjUkMiA9IDB4OEQ2MjtcclxudmFyIEdMX0RFUFRIX0NPTVBPTkVOVDE2JDEgPSAweDgxQTU7XHJcbnZhciBHTF9TVEVOQ0lMX0lOREVYOCQxID0gMHg4RDQ4O1xyXG52YXIgR0xfREVQVEhfU1RFTkNJTCQyID0gMHg4NEY5O1xyXG5cclxudmFyIEdMX1NSR0I4X0FMUEhBOF9FWFQkMSA9IDB4OEM0MztcclxuXHJcbnZhciBHTF9SR0JBMzJGX0VYVCQxID0gMHg4ODE0O1xyXG5cclxudmFyIEdMX1JHQkExNkZfRVhUJDEgPSAweDg4MUE7XHJcbnZhciBHTF9SR0IxNkZfRVhUJDEgPSAweDg4MUI7XHJcblxyXG52YXIgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRFbnVtcyA9IFtcclxuICBHTF9SR0JBNCQyLFxyXG4gIEdMX1JHQjVfQTEkMixcclxuICBHTF9SR0I1NjUkMixcclxuICBHTF9TUkdCOF9BTFBIQThfRVhUJDEsXHJcbiAgR0xfUkdCQTE2Rl9FWFQkMSxcclxuICBHTF9SR0IxNkZfRVhUJDEsXHJcbiAgR0xfUkdCQTMyRl9FWFQkMVxyXG5dO1xyXG5cclxudmFyIHN0YXR1c0NvZGUgPSB7fTtcclxuc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9DT01QTEVURSQxXSA9ICdjb21wbGV0ZSc7XHJcbnN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9BVFRBQ0hNRU5UXSA9ICdpbmNvbXBsZXRlIGF0dGFjaG1lbnQnO1xyXG5zdGF0dXNDb2RlW0dMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfRElNRU5TSU9OU10gPSAnaW5jb21wbGV0ZSBkaW1lbnNpb25zJztcclxuc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX01JU1NJTkdfQVRUQUNITUVOVF0gPSAnaW5jb21wbGV0ZSwgbWlzc2luZyBhdHRhY2htZW50Jztcclxuc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9VTlNVUFBPUlRFRF0gPSAndW5zdXBwb3J0ZWQnO1xyXG5cclxuZnVuY3Rpb24gd3JhcEZCT1N0YXRlIChcclxuICBnbCxcclxuICBleHRlbnNpb25zLFxyXG4gIGxpbWl0cyxcclxuICB0ZXh0dXJlU3RhdGUsXHJcbiAgcmVuZGVyYnVmZmVyU3RhdGUsXHJcbiAgc3RhdHMpIHtcclxuICB2YXIgZnJhbWVidWZmZXJTdGF0ZSA9IHtcclxuICAgIGN1cjogbnVsbCxcclxuICAgIG5leHQ6IG51bGwsXHJcbiAgICBkaXJ0eTogZmFsc2UsXHJcbiAgICBzZXRGQk86IG51bGxcclxuICB9O1xyXG5cclxuICB2YXIgY29sb3JUZXh0dXJlRm9ybWF0cyA9IFsncmdiYSddO1xyXG4gIHZhciBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMgPSBbJ3JnYmE0JywgJ3JnYjU2NScsICdyZ2I1IGExJ107XHJcblxyXG4gIGlmIChleHRlbnNpb25zLmV4dF9zcmdiKSB7XHJcbiAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMucHVzaCgnc3JnYmEnKTtcclxuICB9XHJcblxyXG4gIGlmIChleHRlbnNpb25zLmV4dF9jb2xvcl9idWZmZXJfaGFsZl9mbG9hdCkge1xyXG4gICAgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzLnB1c2goJ3JnYmExNmYnLCAncmdiMTZmJyk7XHJcbiAgfVxyXG5cclxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb2xvcl9idWZmZXJfZmxvYXQpIHtcclxuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cy5wdXNoKCdyZ2JhMzJmJyk7XHJcbiAgfVxyXG5cclxuICB2YXIgY29sb3JUeXBlcyA9IFsndWludDgnXTtcclxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9oYWxmX2Zsb2F0KSB7XHJcbiAgICBjb2xvclR5cGVzLnB1c2goJ2hhbGYgZmxvYXQnLCAnZmxvYXQxNicpO1xyXG4gIH1cclxuICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9mbG9hdCkge1xyXG4gICAgY29sb3JUeXBlcy5wdXNoKCdmbG9hdCcsICdmbG9hdDMyJyk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQgKHRhcmdldCwgdGV4dHVyZSwgcmVuZGVyYnVmZmVyKSB7XHJcbiAgICB0aGlzLnRhcmdldCA9IHRhcmdldDtcclxuICAgIHRoaXMudGV4dHVyZSA9IHRleHR1cmU7XHJcbiAgICB0aGlzLnJlbmRlcmJ1ZmZlciA9IHJlbmRlcmJ1ZmZlcjtcclxuXHJcbiAgICB2YXIgdyA9IDA7XHJcbiAgICB2YXIgaCA9IDA7XHJcbiAgICBpZiAodGV4dHVyZSkge1xyXG4gICAgICB3ID0gdGV4dHVyZS53aWR0aDtcclxuICAgICAgaCA9IHRleHR1cmUuaGVpZ2h0O1xyXG4gICAgfSBlbHNlIGlmIChyZW5kZXJidWZmZXIpIHtcclxuICAgICAgdyA9IHJlbmRlcmJ1ZmZlci53aWR0aDtcclxuICAgICAgaCA9IHJlbmRlcmJ1ZmZlci5oZWlnaHQ7XHJcbiAgICB9XHJcbiAgICB0aGlzLndpZHRoID0gdztcclxuICAgIHRoaXMuaGVpZ2h0ID0gaDtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGRlY1JlZiAoYXR0YWNobWVudCkge1xyXG4gICAgaWYgKGF0dGFjaG1lbnQpIHtcclxuICAgICAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xyXG4gICAgICAgIGF0dGFjaG1lbnQudGV4dHVyZS5fdGV4dHVyZS5kZWNSZWYoKTtcclxuICAgICAgfVxyXG4gICAgICBpZiAoYXR0YWNobWVudC5yZW5kZXJidWZmZXIpIHtcclxuICAgICAgICBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyLmRlY1JlZigpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBpbmNSZWZBbmRDaGVja1NoYXBlIChhdHRhY2htZW50LCB3aWR0aCwgaGVpZ2h0KSB7XHJcbiAgICBpZiAoIWF0dGFjaG1lbnQpIHtcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcbiAgICBpZiAoYXR0YWNobWVudC50ZXh0dXJlKSB7XHJcbiAgICAgIHZhciB0ZXh0dXJlID0gYXR0YWNobWVudC50ZXh0dXJlLl90ZXh0dXJlO1xyXG4gICAgICB2YXIgdHcgPSBNYXRoLm1heCgxLCB0ZXh0dXJlLndpZHRoKTtcclxuICAgICAgdmFyIHRoID0gTWF0aC5tYXgoMSwgdGV4dHVyZS5oZWlnaHQpO1xyXG4gICAgICBjaGVjayQxKHR3ID09PSB3aWR0aCAmJiB0aCA9PT0gaGVpZ2h0LFxyXG4gICAgICAgICdpbmNvbnNpc3RlbnQgd2lkdGgvaGVpZ2h0IGZvciBzdXBwbGllZCB0ZXh0dXJlJyk7XHJcbiAgICAgIHRleHR1cmUucmVmQ291bnQgKz0gMTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHZhciByZW5kZXJidWZmZXIgPSBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyO1xyXG4gICAgICBjaGVjayQxKFxyXG4gICAgICAgIHJlbmRlcmJ1ZmZlci53aWR0aCA9PT0gd2lkdGggJiYgcmVuZGVyYnVmZmVyLmhlaWdodCA9PT0gaGVpZ2h0LFxyXG4gICAgICAgICdpbmNvbnNpc3RlbnQgd2lkdGgvaGVpZ2h0IGZvciByZW5kZXJidWZmZXInKTtcclxuICAgICAgcmVuZGVyYnVmZmVyLnJlZkNvdW50ICs9IDE7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBhdHRhY2ggKGxvY2F0aW9uLCBhdHRhY2htZW50KSB7XHJcbiAgICBpZiAoYXR0YWNobWVudCkge1xyXG4gICAgICBpZiAoYXR0YWNobWVudC50ZXh0dXJlKSB7XHJcbiAgICAgICAgZ2wuZnJhbWVidWZmZXJUZXh0dXJlMkQoXHJcbiAgICAgICAgICBHTF9GUkFNRUJVRkZFUiQxLFxyXG4gICAgICAgICAgbG9jYXRpb24sXHJcbiAgICAgICAgICBhdHRhY2htZW50LnRhcmdldCxcclxuICAgICAgICAgIGF0dGFjaG1lbnQudGV4dHVyZS5fdGV4dHVyZS50ZXh0dXJlLFxyXG4gICAgICAgICAgMCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgZ2wuZnJhbWVidWZmZXJSZW5kZXJidWZmZXIoXHJcbiAgICAgICAgICBHTF9GUkFNRUJVRkZFUiQxLFxyXG4gICAgICAgICAgbG9jYXRpb24sXHJcbiAgICAgICAgICBHTF9SRU5ERVJCVUZGRVIkMSxcclxuICAgICAgICAgIGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIucmVuZGVyYnVmZmVyKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gcGFyc2VBdHRhY2htZW50IChhdHRhY2htZW50KSB7XHJcbiAgICB2YXIgdGFyZ2V0ID0gR0xfVEVYVFVSRV8yRCQyO1xyXG4gICAgdmFyIHRleHR1cmUgPSBudWxsO1xyXG4gICAgdmFyIHJlbmRlcmJ1ZmZlciA9IG51bGw7XHJcblxyXG4gICAgdmFyIGRhdGEgPSBhdHRhY2htZW50O1xyXG4gICAgaWYgKHR5cGVvZiBhdHRhY2htZW50ID09PSAnb2JqZWN0Jykge1xyXG4gICAgICBkYXRhID0gYXR0YWNobWVudC5kYXRhO1xyXG4gICAgICBpZiAoJ3RhcmdldCcgaW4gYXR0YWNobWVudCkge1xyXG4gICAgICAgIHRhcmdldCA9IGF0dGFjaG1lbnQudGFyZ2V0IHwgMDtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGNoZWNrJDEudHlwZShkYXRhLCAnZnVuY3Rpb24nLCAnaW52YWxpZCBhdHRhY2htZW50IGRhdGEnKTtcclxuXHJcbiAgICB2YXIgdHlwZSA9IGRhdGEuX3JlZ2xUeXBlO1xyXG4gICAgaWYgKHR5cGUgPT09ICd0ZXh0dXJlMmQnKSB7XHJcbiAgICAgIHRleHR1cmUgPSBkYXRhO1xyXG4gICAgICBjaGVjayQxKHRhcmdldCA9PT0gR0xfVEVYVFVSRV8yRCQyKTtcclxuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3RleHR1cmVDdWJlJykge1xyXG4gICAgICB0ZXh0dXJlID0gZGF0YTtcclxuICAgICAgY2hlY2skMShcclxuICAgICAgICB0YXJnZXQgPj0gR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YJDIgJiZcclxuICAgICAgICB0YXJnZXQgPCBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1gkMiArIDYsXHJcbiAgICAgICAgJ2ludmFsaWQgY3ViZSBtYXAgdGFyZ2V0Jyk7XHJcbiAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdyZW5kZXJidWZmZXInKSB7XHJcbiAgICAgIHJlbmRlcmJ1ZmZlciA9IGRhdGE7XHJcbiAgICAgIHRhcmdldCA9IEdMX1JFTkRFUkJVRkZFUiQxO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY2hlY2skMS5yYWlzZSgnaW52YWxpZCByZWdsIG9iamVjdCBmb3IgYXR0YWNobWVudCcpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBuZXcgRnJhbWVidWZmZXJBdHRhY2htZW50KHRhcmdldCwgdGV4dHVyZSwgcmVuZGVyYnVmZmVyKVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gYWxsb2NBdHRhY2htZW50IChcclxuICAgIHdpZHRoLFxyXG4gICAgaGVpZ2h0LFxyXG4gICAgaXNUZXh0dXJlLFxyXG4gICAgZm9ybWF0LFxyXG4gICAgdHlwZSkge1xyXG4gICAgaWYgKGlzVGV4dHVyZSkge1xyXG4gICAgICB2YXIgdGV4dHVyZSA9IHRleHR1cmVTdGF0ZS5jcmVhdGUyRCh7XHJcbiAgICAgICAgd2lkdGg6IHdpZHRoLFxyXG4gICAgICAgIGhlaWdodDogaGVpZ2h0LFxyXG4gICAgICAgIGZvcm1hdDogZm9ybWF0LFxyXG4gICAgICAgIHR5cGU6IHR5cGVcclxuICAgICAgfSk7XHJcbiAgICAgIHRleHR1cmUuX3RleHR1cmUucmVmQ291bnQgPSAwO1xyXG4gICAgICByZXR1cm4gbmV3IEZyYW1lYnVmZmVyQXR0YWNobWVudChHTF9URVhUVVJFXzJEJDIsIHRleHR1cmUsIG51bGwpXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB2YXIgcmIgPSByZW5kZXJidWZmZXJTdGF0ZS5jcmVhdGUoe1xyXG4gICAgICAgIHdpZHRoOiB3aWR0aCxcclxuICAgICAgICBoZWlnaHQ6IGhlaWdodCxcclxuICAgICAgICBmb3JtYXQ6IGZvcm1hdFxyXG4gICAgICB9KTtcclxuICAgICAgcmIuX3JlbmRlcmJ1ZmZlci5yZWZDb3VudCA9IDA7XHJcbiAgICAgIHJldHVybiBuZXcgRnJhbWVidWZmZXJBdHRhY2htZW50KEdMX1JFTkRFUkJVRkZFUiQxLCBudWxsLCByYilcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHVud3JhcEF0dGFjaG1lbnQgKGF0dGFjaG1lbnQpIHtcclxuICAgIHJldHVybiBhdHRhY2htZW50ICYmIChhdHRhY2htZW50LnRleHR1cmUgfHwgYXR0YWNobWVudC5yZW5kZXJidWZmZXIpXHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiByZXNpemVBdHRhY2htZW50IChhdHRhY2htZW50LCB3LCBoKSB7XHJcbiAgICBpZiAoYXR0YWNobWVudCkge1xyXG4gICAgICBpZiAoYXR0YWNobWVudC50ZXh0dXJlKSB7XHJcbiAgICAgICAgYXR0YWNobWVudC50ZXh0dXJlLnJlc2l6ZSh3LCBoKTtcclxuICAgICAgfSBlbHNlIGlmIChhdHRhY2htZW50LnJlbmRlcmJ1ZmZlcikge1xyXG4gICAgICAgIGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLnJlc2l6ZSh3LCBoKTtcclxuICAgICAgfVxyXG4gICAgICBhdHRhY2htZW50LndpZHRoID0gdztcclxuICAgICAgYXR0YWNobWVudC5oZWlnaHQgPSBoO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgdmFyIGZyYW1lYnVmZmVyQ291bnQgPSAwO1xyXG4gIHZhciBmcmFtZWJ1ZmZlclNldCA9IHt9O1xyXG5cclxuICBmdW5jdGlvbiBSRUdMRnJhbWVidWZmZXIgKCkge1xyXG4gICAgdGhpcy5pZCA9IGZyYW1lYnVmZmVyQ291bnQrKztcclxuICAgIGZyYW1lYnVmZmVyU2V0W3RoaXMuaWRdID0gdGhpcztcclxuXHJcbiAgICB0aGlzLmZyYW1lYnVmZmVyID0gZ2wuY3JlYXRlRnJhbWVidWZmZXIoKTtcclxuICAgIHRoaXMud2lkdGggPSAwO1xyXG4gICAgdGhpcy5oZWlnaHQgPSAwO1xyXG5cclxuICAgIHRoaXMuY29sb3JBdHRhY2htZW50cyA9IFtdO1xyXG4gICAgdGhpcy5kZXB0aEF0dGFjaG1lbnQgPSBudWxsO1xyXG4gICAgdGhpcy5zdGVuY2lsQXR0YWNobWVudCA9IG51bGw7XHJcbiAgICB0aGlzLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQgPSBudWxsO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZGVjRkJPUmVmcyAoZnJhbWVidWZmZXIpIHtcclxuICAgIGZyYW1lYnVmZmVyLmNvbG9yQXR0YWNobWVudHMuZm9yRWFjaChkZWNSZWYpO1xyXG4gICAgZGVjUmVmKGZyYW1lYnVmZmVyLmRlcHRoQXR0YWNobWVudCk7XHJcbiAgICBkZWNSZWYoZnJhbWVidWZmZXIuc3RlbmNpbEF0dGFjaG1lbnQpO1xyXG4gICAgZGVjUmVmKGZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQpO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZGVzdHJveSAoZnJhbWVidWZmZXIpIHtcclxuICAgIHZhciBoYW5kbGUgPSBmcmFtZWJ1ZmZlci5mcmFtZWJ1ZmZlcjtcclxuICAgIGNoZWNrJDEoaGFuZGxlLCAnbXVzdCBub3QgZG91YmxlIGRlc3Ryb3kgZnJhbWVidWZmZXInKTtcclxuICAgIGdsLmRlbGV0ZUZyYW1lYnVmZmVyKGhhbmRsZSk7XHJcbiAgICBmcmFtZWJ1ZmZlci5mcmFtZWJ1ZmZlciA9IG51bGw7XHJcbiAgICBzdGF0cy5mcmFtZWJ1ZmZlckNvdW50LS07XHJcbiAgICBkZWxldGUgZnJhbWVidWZmZXJTZXRbZnJhbWVidWZmZXIuaWRdO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gdXBkYXRlRnJhbWVidWZmZXIgKGZyYW1lYnVmZmVyKSB7XHJcbiAgICB2YXIgaTtcclxuXHJcbiAgICBnbC5iaW5kRnJhbWVidWZmZXIoR0xfRlJBTUVCVUZGRVIkMSwgZnJhbWVidWZmZXIuZnJhbWVidWZmZXIpO1xyXG4gICAgdmFyIGNvbG9yQXR0YWNobWVudHMgPSBmcmFtZWJ1ZmZlci5jb2xvckF0dGFjaG1lbnRzO1xyXG4gICAgZm9yIChpID0gMDsgaSA8IGNvbG9yQXR0YWNobWVudHMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgYXR0YWNoKEdMX0NPTE9SX0FUVEFDSE1FTlQwJDEgKyBpLCBjb2xvckF0dGFjaG1lbnRzW2ldKTtcclxuICAgIH1cclxuICAgIGZvciAoaSA9IGNvbG9yQXR0YWNobWVudHMubGVuZ3RoOyBpIDwgbGltaXRzLm1heENvbG9yQXR0YWNobWVudHM7ICsraSkge1xyXG4gICAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChcclxuICAgICAgICBHTF9GUkFNRUJVRkZFUiQxLFxyXG4gICAgICAgIEdMX0NPTE9SX0FUVEFDSE1FTlQwJDEgKyBpLFxyXG4gICAgICAgIEdMX1RFWFRVUkVfMkQkMixcclxuICAgICAgICBudWxsLFxyXG4gICAgICAgIDApO1xyXG4gICAgfVxyXG5cclxuICAgIGdsLmZyYW1lYnVmZmVyVGV4dHVyZTJEKFxyXG4gICAgICBHTF9GUkFNRUJVRkZFUiQxLFxyXG4gICAgICBHTF9ERVBUSF9TVEVOQ0lMX0FUVEFDSE1FTlQsXHJcbiAgICAgIEdMX1RFWFRVUkVfMkQkMixcclxuICAgICAgbnVsbCxcclxuICAgICAgMCk7XHJcbiAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChcclxuICAgICAgR0xfRlJBTUVCVUZGRVIkMSxcclxuICAgICAgR0xfREVQVEhfQVRUQUNITUVOVCxcclxuICAgICAgR0xfVEVYVFVSRV8yRCQyLFxyXG4gICAgICBudWxsLFxyXG4gICAgICAwKTtcclxuICAgIGdsLmZyYW1lYnVmZmVyVGV4dHVyZTJEKFxyXG4gICAgICBHTF9GUkFNRUJVRkZFUiQxLFxyXG4gICAgICBHTF9TVEVOQ0lMX0FUVEFDSE1FTlQsXHJcbiAgICAgIEdMX1RFWFRVUkVfMkQkMixcclxuICAgICAgbnVsbCxcclxuICAgICAgMCk7XHJcblxyXG4gICAgYXR0YWNoKEdMX0RFUFRIX0FUVEFDSE1FTlQsIGZyYW1lYnVmZmVyLmRlcHRoQXR0YWNobWVudCk7XHJcbiAgICBhdHRhY2goR0xfU1RFTkNJTF9BVFRBQ0hNRU5ULCBmcmFtZWJ1ZmZlci5zdGVuY2lsQXR0YWNobWVudCk7XHJcbiAgICBhdHRhY2goR0xfREVQVEhfU1RFTkNJTF9BVFRBQ0hNRU5ULCBmcmFtZWJ1ZmZlci5kZXB0aFN0ZW5jaWxBdHRhY2htZW50KTtcclxuXHJcbiAgICAvLyBDaGVjayBzdGF0dXMgY29kZVxyXG4gICAgdmFyIHN0YXR1cyA9IGdsLmNoZWNrRnJhbWVidWZmZXJTdGF0dXMoR0xfRlJBTUVCVUZGRVIkMSk7XHJcbiAgICBpZiAoIWdsLmlzQ29udGV4dExvc3QoKSAmJiBzdGF0dXMgIT09IEdMX0ZSQU1FQlVGRkVSX0NPTVBMRVRFJDEpIHtcclxuICAgICAgY2hlY2skMS5yYWlzZSgnZnJhbWVidWZmZXIgY29uZmlndXJhdGlvbiBub3Qgc3VwcG9ydGVkLCBzdGF0dXMgPSAnICtcclxuICAgICAgICBzdGF0dXNDb2RlW3N0YXR1c10pO1xyXG4gICAgfVxyXG5cclxuICAgIGdsLmJpbmRGcmFtZWJ1ZmZlcihHTF9GUkFNRUJVRkZFUiQxLCBmcmFtZWJ1ZmZlclN0YXRlLm5leHQgPyBmcmFtZWJ1ZmZlclN0YXRlLm5leHQuZnJhbWVidWZmZXIgOiBudWxsKTtcclxuICAgIGZyYW1lYnVmZmVyU3RhdGUuY3VyID0gZnJhbWVidWZmZXJTdGF0ZS5uZXh0O1xyXG5cclxuICAgIC8vIEZJWE1FOiBDbGVhciBlcnJvciBjb2RlIGhlcmUuICBUaGlzIGlzIGEgd29yayBhcm91bmQgZm9yIGEgYnVnIGluXHJcbiAgICAvLyBoZWFkbGVzcy1nbFxyXG4gICAgZ2wuZ2V0RXJyb3IoKTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGNyZWF0ZUZCTyAoYTAsIGExKSB7XHJcbiAgICB2YXIgZnJhbWVidWZmZXIgPSBuZXcgUkVHTEZyYW1lYnVmZmVyKCk7XHJcbiAgICBzdGF0cy5mcmFtZWJ1ZmZlckNvdW50Kys7XHJcblxyXG4gICAgZnVuY3Rpb24gcmVnbEZyYW1lYnVmZmVyIChhLCBiKSB7XHJcbiAgICAgIHZhciBpO1xyXG5cclxuICAgICAgY2hlY2skMShmcmFtZWJ1ZmZlclN0YXRlLm5leHQgIT09IGZyYW1lYnVmZmVyLFxyXG4gICAgICAgICdjYW4gbm90IHVwZGF0ZSBmcmFtZWJ1ZmZlciB3aGljaCBpcyBjdXJyZW50bHkgaW4gdXNlJyk7XHJcblxyXG4gICAgICB2YXIgd2lkdGggPSAwO1xyXG4gICAgICB2YXIgaGVpZ2h0ID0gMDtcclxuXHJcbiAgICAgIHZhciBuZWVkc0RlcHRoID0gdHJ1ZTtcclxuICAgICAgdmFyIG5lZWRzU3RlbmNpbCA9IHRydWU7XHJcblxyXG4gICAgICB2YXIgY29sb3JCdWZmZXIgPSBudWxsO1xyXG4gICAgICB2YXIgY29sb3JUZXh0dXJlID0gdHJ1ZTtcclxuICAgICAgdmFyIGNvbG9yRm9ybWF0ID0gJ3JnYmEnO1xyXG4gICAgICB2YXIgY29sb3JUeXBlID0gJ3VpbnQ4JztcclxuICAgICAgdmFyIGNvbG9yQ291bnQgPSAxO1xyXG5cclxuICAgICAgdmFyIGRlcHRoQnVmZmVyID0gbnVsbDtcclxuICAgICAgdmFyIHN0ZW5jaWxCdWZmZXIgPSBudWxsO1xyXG4gICAgICB2YXIgZGVwdGhTdGVuY2lsQnVmZmVyID0gbnVsbDtcclxuICAgICAgdmFyIGRlcHRoU3RlbmNpbFRleHR1cmUgPSBmYWxzZTtcclxuXHJcbiAgICAgIGlmICh0eXBlb2YgYSA9PT0gJ251bWJlcicpIHtcclxuICAgICAgICB3aWR0aCA9IGEgfCAwO1xyXG4gICAgICAgIGhlaWdodCA9IChiIHwgMCkgfHwgd2lkdGg7XHJcbiAgICAgIH0gZWxzZSBpZiAoIWEpIHtcclxuICAgICAgICB3aWR0aCA9IGhlaWdodCA9IDE7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgY2hlY2skMS50eXBlKGEsICdvYmplY3QnLCAnaW52YWxpZCBhcmd1bWVudHMgZm9yIGZyYW1lYnVmZmVyJyk7XHJcbiAgICAgICAgdmFyIG9wdGlvbnMgPSBhO1xyXG5cclxuICAgICAgICBpZiAoJ3NoYXBlJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgICB2YXIgc2hhcGUgPSBvcHRpb25zLnNoYXBlO1xyXG4gICAgICAgICAgY2hlY2skMShBcnJheS5pc0FycmF5KHNoYXBlKSAmJiBzaGFwZS5sZW5ndGggPj0gMixcclxuICAgICAgICAgICAgJ2ludmFsaWQgc2hhcGUgZm9yIGZyYW1lYnVmZmVyJyk7XHJcbiAgICAgICAgICB3aWR0aCA9IHNoYXBlWzBdO1xyXG4gICAgICAgICAgaGVpZ2h0ID0gc2hhcGVbMV07XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGlmICgncmFkaXVzJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgICAgIHdpZHRoID0gaGVpZ2h0ID0gb3B0aW9ucy5yYWRpdXM7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBpZiAoJ3dpZHRoJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgICAgIHdpZHRoID0gb3B0aW9ucy53aWR0aDtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGlmICgnaGVpZ2h0JyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgICAgIGhlaWdodCA9IG9wdGlvbnMuaGVpZ2h0O1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKCdjb2xvcicgaW4gb3B0aW9ucyB8fFxyXG4gICAgICAgICAgICAnY29sb3JzJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgICBjb2xvckJ1ZmZlciA9XHJcbiAgICAgICAgICAgIG9wdGlvbnMuY29sb3IgfHxcclxuICAgICAgICAgICAgb3B0aW9ucy5jb2xvcnM7XHJcbiAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShjb2xvckJ1ZmZlcikpIHtcclxuICAgICAgICAgICAgY2hlY2skMShcclxuICAgICAgICAgICAgICBjb2xvckJ1ZmZlci5sZW5ndGggPT09IDEgfHwgZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnMsXHJcbiAgICAgICAgICAgICAgJ211bHRpcGxlIHJlbmRlciB0YXJnZXRzIG5vdCBzdXBwb3J0ZWQnKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICghY29sb3JCdWZmZXIpIHtcclxuICAgICAgICAgIGlmICgnY29sb3JDb3VudCcgaW4gb3B0aW9ucykge1xyXG4gICAgICAgICAgICBjb2xvckNvdW50ID0gb3B0aW9ucy5jb2xvckNvdW50IHwgMDtcclxuICAgICAgICAgICAgY2hlY2skMShjb2xvckNvdW50ID4gMCwgJ2ludmFsaWQgY29sb3IgYnVmZmVyIGNvdW50Jyk7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgaWYgKCdjb2xvclRleHR1cmUnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgICAgY29sb3JUZXh0dXJlID0gISFvcHRpb25zLmNvbG9yVGV4dHVyZTtcclxuICAgICAgICAgICAgY29sb3JGb3JtYXQgPSAncmdiYTQnO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIGlmICgnY29sb3JUeXBlJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgICAgIGNvbG9yVHlwZSA9IG9wdGlvbnMuY29sb3JUeXBlO1xyXG4gICAgICAgICAgICBpZiAoIWNvbG9yVGV4dHVyZSkge1xyXG4gICAgICAgICAgICAgIGlmIChjb2xvclR5cGUgPT09ICdoYWxmIGZsb2F0JyB8fCBjb2xvclR5cGUgPT09ICdmbG9hdDE2Jykge1xyXG4gICAgICAgICAgICAgICAgY2hlY2skMShleHRlbnNpb25zLmV4dF9jb2xvcl9idWZmZXJfaGFsZl9mbG9hdCxcclxuICAgICAgICAgICAgICAgICAgJ3lvdSBtdXN0IGVuYWJsZSBFWFRfY29sb3JfYnVmZmVyX2hhbGZfZmxvYXQgdG8gdXNlIDE2LWJpdCByZW5kZXIgYnVmZmVycycpO1xyXG4gICAgICAgICAgICAgICAgY29sb3JGb3JtYXQgPSAncmdiYTE2Zic7XHJcbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChjb2xvclR5cGUgPT09ICdmbG9hdCcgfHwgY29sb3JUeXBlID09PSAnZmxvYXQzMicpIHtcclxuICAgICAgICAgICAgICAgIGNoZWNrJDEoZXh0ZW5zaW9ucy53ZWJnbF9jb2xvcl9idWZmZXJfZmxvYXQsXHJcbiAgICAgICAgICAgICAgICAgICd5b3UgbXVzdCBlbmFibGUgV0VCR0xfY29sb3JfYnVmZmVyX2Zsb2F0IGluIG9yZGVyIHRvIHVzZSAzMi1iaXQgZmxvYXRpbmcgcG9pbnQgcmVuZGVyYnVmZmVycycpO1xyXG4gICAgICAgICAgICAgICAgY29sb3JGb3JtYXQgPSAncmdiYTMyZic7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9mbG9hdCB8fFxyXG4gICAgICAgICAgICAgICAgIShjb2xvclR5cGUgPT09ICdmbG9hdCcgfHwgY29sb3JUeXBlID09PSAnZmxvYXQzMicpLFxyXG4gICAgICAgICAgICAgICAgJ3lvdSBtdXN0IGVuYWJsZSBPRVNfdGV4dHVyZV9mbG9hdCBpbiBvcmRlciB0byB1c2UgZmxvYXRpbmcgcG9pbnQgZnJhbWVidWZmZXIgb2JqZWN0cycpO1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9oYWxmX2Zsb2F0IHx8XHJcbiAgICAgICAgICAgICAgICAhKGNvbG9yVHlwZSA9PT0gJ2hhbGYgZmxvYXQnIHx8IGNvbG9yVHlwZSA9PT0gJ2Zsb2F0MTYnKSxcclxuICAgICAgICAgICAgICAgICd5b3UgbXVzdCBlbmFibGUgT0VTX3RleHR1cmVfaGFsZl9mbG9hdCBpbiBvcmRlciB0byB1c2UgMTYtYml0IGZsb2F0aW5nIHBvaW50IGZyYW1lYnVmZmVyIG9iamVjdHMnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjaGVjayQxLm9uZU9mKGNvbG9yVHlwZSwgY29sb3JUeXBlcywgJ2ludmFsaWQgY29sb3IgdHlwZScpO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIGlmICgnY29sb3JGb3JtYXQnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgICAgY29sb3JGb3JtYXQgPSBvcHRpb25zLmNvbG9yRm9ybWF0O1xyXG4gICAgICAgICAgICBpZiAoY29sb3JUZXh0dXJlRm9ybWF0cy5pbmRleE9mKGNvbG9yRm9ybWF0KSA+PSAwKSB7XHJcbiAgICAgICAgICAgICAgY29sb3JUZXh0dXJlID0gdHJ1ZTtcclxuICAgICAgICAgICAgfSBlbHNlIGlmIChjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMuaW5kZXhPZihjb2xvckZvcm1hdCkgPj0gMCkge1xyXG4gICAgICAgICAgICAgIGNvbG9yVGV4dHVyZSA9IGZhbHNlO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgIGlmIChjb2xvclRleHR1cmUpIHtcclxuICAgICAgICAgICAgICAgIGNoZWNrJDEub25lT2YoXHJcbiAgICAgICAgICAgICAgICAgIG9wdGlvbnMuY29sb3JGb3JtYXQsIGNvbG9yVGV4dHVyZUZvcm1hdHMsXHJcbiAgICAgICAgICAgICAgICAgICdpbnZhbGlkIGNvbG9yIGZvcm1hdCBmb3IgdGV4dHVyZScpO1xyXG4gICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBjaGVjayQxLm9uZU9mKFxyXG4gICAgICAgICAgICAgICAgICBvcHRpb25zLmNvbG9yRm9ybWF0LCBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMsXHJcbiAgICAgICAgICAgICAgICAgICdpbnZhbGlkIGNvbG9yIGZvcm1hdCBmb3IgcmVuZGVyYnVmZmVyJyk7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoJ2RlcHRoVGV4dHVyZScgaW4gb3B0aW9ucyB8fCAnZGVwdGhTdGVuY2lsVGV4dHVyZScgaW4gb3B0aW9ucykge1xyXG4gICAgICAgICAgZGVwdGhTdGVuY2lsVGV4dHVyZSA9ICEhKG9wdGlvbnMuZGVwdGhUZXh0dXJlIHx8XHJcbiAgICAgICAgICAgIG9wdGlvbnMuZGVwdGhTdGVuY2lsVGV4dHVyZSk7XHJcbiAgICAgICAgICBjaGVjayQxKCFkZXB0aFN0ZW5jaWxUZXh0dXJlIHx8IGV4dGVuc2lvbnMud2ViZ2xfZGVwdGhfdGV4dHVyZSxcclxuICAgICAgICAgICAgJ3dlYmdsX2RlcHRoX3RleHR1cmUgZXh0ZW5zaW9uIG5vdCBzdXBwb3J0ZWQnKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICgnZGVwdGgnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5kZXB0aCA9PT0gJ2Jvb2xlYW4nKSB7XHJcbiAgICAgICAgICAgIG5lZWRzRGVwdGggPSBvcHRpb25zLmRlcHRoO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgZGVwdGhCdWZmZXIgPSBvcHRpb25zLmRlcHRoO1xyXG4gICAgICAgICAgICBuZWVkc1N0ZW5jaWwgPSBmYWxzZTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICgnc3RlbmNpbCcgaW4gb3B0aW9ucykge1xyXG4gICAgICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLnN0ZW5jaWwgPT09ICdib29sZWFuJykge1xyXG4gICAgICAgICAgICBuZWVkc1N0ZW5jaWwgPSBvcHRpb25zLnN0ZW5jaWw7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBzdGVuY2lsQnVmZmVyID0gb3B0aW9ucy5zdGVuY2lsO1xyXG4gICAgICAgICAgICBuZWVkc0RlcHRoID0gZmFsc2U7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoJ2RlcHRoU3RlbmNpbCcgaW4gb3B0aW9ucykge1xyXG4gICAgICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLmRlcHRoU3RlbmNpbCA9PT0gJ2Jvb2xlYW4nKSB7XHJcbiAgICAgICAgICAgIG5lZWRzRGVwdGggPSBuZWVkc1N0ZW5jaWwgPSBvcHRpb25zLmRlcHRoU3RlbmNpbDtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGRlcHRoU3RlbmNpbEJ1ZmZlciA9IG9wdGlvbnMuZGVwdGhTdGVuY2lsO1xyXG4gICAgICAgICAgICBuZWVkc0RlcHRoID0gZmFsc2U7XHJcbiAgICAgICAgICAgIG5lZWRzU3RlbmNpbCA9IGZhbHNlO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gcGFyc2UgYXR0YWNobWVudHNcclxuICAgICAgdmFyIGNvbG9yQXR0YWNobWVudHMgPSBudWxsO1xyXG4gICAgICB2YXIgZGVwdGhBdHRhY2htZW50ID0gbnVsbDtcclxuICAgICAgdmFyIHN0ZW5jaWxBdHRhY2htZW50ID0gbnVsbDtcclxuICAgICAgdmFyIGRlcHRoU3RlbmNpbEF0dGFjaG1lbnQgPSBudWxsO1xyXG5cclxuICAgICAgLy8gU2V0IHVwIGNvbG9yIGF0dGFjaG1lbnRzXHJcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KGNvbG9yQnVmZmVyKSkge1xyXG4gICAgICAgIGNvbG9yQXR0YWNobWVudHMgPSBjb2xvckJ1ZmZlci5tYXAocGFyc2VBdHRhY2htZW50KTtcclxuICAgICAgfSBlbHNlIGlmIChjb2xvckJ1ZmZlcikge1xyXG4gICAgICAgIGNvbG9yQXR0YWNobWVudHMgPSBbcGFyc2VBdHRhY2htZW50KGNvbG9yQnVmZmVyKV07XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgY29sb3JBdHRhY2htZW50cyA9IG5ldyBBcnJheShjb2xvckNvdW50KTtcclxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JDb3VudDsgKytpKSB7XHJcbiAgICAgICAgICBjb2xvckF0dGFjaG1lbnRzW2ldID0gYWxsb2NBdHRhY2htZW50KFxyXG4gICAgICAgICAgICB3aWR0aCxcclxuICAgICAgICAgICAgaGVpZ2h0LFxyXG4gICAgICAgICAgICBjb2xvclRleHR1cmUsXHJcbiAgICAgICAgICAgIGNvbG9yRm9ybWF0LFxyXG4gICAgICAgICAgICBjb2xvclR5cGUpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgY2hlY2skMShleHRlbnNpb25zLndlYmdsX2RyYXdfYnVmZmVycyB8fCBjb2xvckF0dGFjaG1lbnRzLmxlbmd0aCA8PSAxLFxyXG4gICAgICAgICd5b3UgbXVzdCBlbmFibGUgdGhlIFdFQkdMX2RyYXdfYnVmZmVycyBleHRlbnNpb24gaW4gb3JkZXIgdG8gdXNlIG11bHRpcGxlIGNvbG9yIGJ1ZmZlcnMuJyk7XHJcbiAgICAgIGNoZWNrJDEoY29sb3JBdHRhY2htZW50cy5sZW5ndGggPD0gbGltaXRzLm1heENvbG9yQXR0YWNobWVudHMsXHJcbiAgICAgICAgJ3RvbyBtYW55IGNvbG9yIGF0dGFjaG1lbnRzLCBub3Qgc3VwcG9ydGVkJyk7XHJcblxyXG4gICAgICB3aWR0aCA9IHdpZHRoIHx8IGNvbG9yQXR0YWNobWVudHNbMF0ud2lkdGg7XHJcbiAgICAgIGhlaWdodCA9IGhlaWdodCB8fCBjb2xvckF0dGFjaG1lbnRzWzBdLmhlaWdodDtcclxuXHJcbiAgICAgIGlmIChkZXB0aEJ1ZmZlcikge1xyXG4gICAgICAgIGRlcHRoQXR0YWNobWVudCA9IHBhcnNlQXR0YWNobWVudChkZXB0aEJ1ZmZlcik7XHJcbiAgICAgIH0gZWxzZSBpZiAobmVlZHNEZXB0aCAmJiAhbmVlZHNTdGVuY2lsKSB7XHJcbiAgICAgICAgZGVwdGhBdHRhY2htZW50ID0gYWxsb2NBdHRhY2htZW50KFxyXG4gICAgICAgICAgd2lkdGgsXHJcbiAgICAgICAgICBoZWlnaHQsXHJcbiAgICAgICAgICBkZXB0aFN0ZW5jaWxUZXh0dXJlLFxyXG4gICAgICAgICAgJ2RlcHRoJyxcclxuICAgICAgICAgICd1aW50MzInKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKHN0ZW5jaWxCdWZmZXIpIHtcclxuICAgICAgICBzdGVuY2lsQXR0YWNobWVudCA9IHBhcnNlQXR0YWNobWVudChzdGVuY2lsQnVmZmVyKTtcclxuICAgICAgfSBlbHNlIGlmIChuZWVkc1N0ZW5jaWwgJiYgIW5lZWRzRGVwdGgpIHtcclxuICAgICAgICBzdGVuY2lsQXR0YWNobWVudCA9IGFsbG9jQXR0YWNobWVudChcclxuICAgICAgICAgIHdpZHRoLFxyXG4gICAgICAgICAgaGVpZ2h0LFxyXG4gICAgICAgICAgZmFsc2UsXHJcbiAgICAgICAgICAnc3RlbmNpbCcsXHJcbiAgICAgICAgICAndWludDgnKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKGRlcHRoU3RlbmNpbEJ1ZmZlcikge1xyXG4gICAgICAgIGRlcHRoU3RlbmNpbEF0dGFjaG1lbnQgPSBwYXJzZUF0dGFjaG1lbnQoZGVwdGhTdGVuY2lsQnVmZmVyKTtcclxuICAgICAgfSBlbHNlIGlmICghZGVwdGhCdWZmZXIgJiYgIXN0ZW5jaWxCdWZmZXIgJiYgbmVlZHNTdGVuY2lsICYmIG5lZWRzRGVwdGgpIHtcclxuICAgICAgICBkZXB0aFN0ZW5jaWxBdHRhY2htZW50ID0gYWxsb2NBdHRhY2htZW50KFxyXG4gICAgICAgICAgd2lkdGgsXHJcbiAgICAgICAgICBoZWlnaHQsXHJcbiAgICAgICAgICBkZXB0aFN0ZW5jaWxUZXh0dXJlLFxyXG4gICAgICAgICAgJ2RlcHRoIHN0ZW5jaWwnLFxyXG4gICAgICAgICAgJ2RlcHRoIHN0ZW5jaWwnKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY2hlY2skMShcclxuICAgICAgICAoISFkZXB0aEJ1ZmZlcikgKyAoISFzdGVuY2lsQnVmZmVyKSArICghIWRlcHRoU3RlbmNpbEJ1ZmZlcikgPD0gMSxcclxuICAgICAgICAnaW52YWxpZCBmcmFtZWJ1ZmZlciBjb25maWd1cmF0aW9uLCBjYW4gc3BlY2lmeSBleGFjdGx5IG9uZSBkZXB0aC9zdGVuY2lsIGF0dGFjaG1lbnQnKTtcclxuXHJcbiAgICAgIHZhciBjb21tb25Db2xvckF0dGFjaG1lbnRTaXplID0gbnVsbDtcclxuXHJcbiAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckF0dGFjaG1lbnRzLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgaW5jUmVmQW5kQ2hlY2tTaGFwZShjb2xvckF0dGFjaG1lbnRzW2ldLCB3aWR0aCwgaGVpZ2h0KTtcclxuICAgICAgICBjaGVjayQxKCFjb2xvckF0dGFjaG1lbnRzW2ldIHx8XHJcbiAgICAgICAgICAoY29sb3JBdHRhY2htZW50c1tpXS50ZXh0dXJlICYmXHJcbiAgICAgICAgICAgIGNvbG9yVGV4dHVyZUZvcm1hdEVudW1zLmluZGV4T2YoY29sb3JBdHRhY2htZW50c1tpXS50ZXh0dXJlLl90ZXh0dXJlLmZvcm1hdCkgPj0gMCkgfHxcclxuICAgICAgICAgIChjb2xvckF0dGFjaG1lbnRzW2ldLnJlbmRlcmJ1ZmZlciAmJlxyXG4gICAgICAgICAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdEVudW1zLmluZGV4T2YoY29sb3JBdHRhY2htZW50c1tpXS5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlci5mb3JtYXQpID49IDApLFxyXG4gICAgICAgICAgJ2ZyYW1lYnVmZmVyIGNvbG9yIGF0dGFjaG1lbnQgJyArIGkgKyAnIGlzIGludmFsaWQnKTtcclxuXHJcbiAgICAgICAgaWYgKGNvbG9yQXR0YWNobWVudHNbaV0gJiYgY29sb3JBdHRhY2htZW50c1tpXS50ZXh0dXJlKSB7XHJcbiAgICAgICAgICB2YXIgY29sb3JBdHRhY2htZW50U2l6ZSA9XHJcbiAgICAgICAgICAgICAgdGV4dHVyZUZvcm1hdENoYW5uZWxzW2NvbG9yQXR0YWNobWVudHNbaV0udGV4dHVyZS5fdGV4dHVyZS5mb3JtYXRdICpcclxuICAgICAgICAgICAgICB0ZXh0dXJlVHlwZVNpemVzW2NvbG9yQXR0YWNobWVudHNbaV0udGV4dHVyZS5fdGV4dHVyZS50eXBlXTtcclxuXHJcbiAgICAgICAgICBpZiAoY29tbW9uQ29sb3JBdHRhY2htZW50U2l6ZSA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICBjb21tb25Db2xvckF0dGFjaG1lbnRTaXplID0gY29sb3JBdHRhY2htZW50U2l6ZTtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIC8vIFdlIG5lZWQgdG8gbWFrZSBzdXJlIHRoYXQgYWxsIGNvbG9yIGF0dGFjaG1lbnRzIGhhdmUgdGhlIHNhbWUgbnVtYmVyIG9mIGJpdHBsYW5lc1xyXG4gICAgICAgICAgICAvLyAodGhhdCBpcywgdGhlIHNhbWUgbnVtZXIgb2YgYml0cyBwZXIgcGl4ZWwpXHJcbiAgICAgICAgICAgIC8vIFRoaXMgaXMgcmVxdWlyZWQgYnkgdGhlIEdMRVMyLjAgc3RhbmRhcmQuIFNlZSB0aGUgYmVnaW5uaW5nIG9mIENoYXB0ZXIgNCBpbiB0aGF0IGRvY3VtZW50LlxyXG4gICAgICAgICAgICBjaGVjayQxKGNvbW1vbkNvbG9yQXR0YWNobWVudFNpemUgPT09IGNvbG9yQXR0YWNobWVudFNpemUsXHJcbiAgICAgICAgICAgICAgICAgICdhbGwgY29sb3IgYXR0YWNobWVudHMgbXVjaCBoYXZlIHRoZSBzYW1lIG51bWJlciBvZiBiaXRzIHBlciBwaXhlbC4nKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgaW5jUmVmQW5kQ2hlY2tTaGFwZShkZXB0aEF0dGFjaG1lbnQsIHdpZHRoLCBoZWlnaHQpO1xyXG4gICAgICBjaGVjayQxKCFkZXB0aEF0dGFjaG1lbnQgfHxcclxuICAgICAgICAoZGVwdGhBdHRhY2htZW50LnRleHR1cmUgJiZcclxuICAgICAgICAgIGRlcHRoQXR0YWNobWVudC50ZXh0dXJlLl90ZXh0dXJlLmZvcm1hdCA9PT0gR0xfREVQVEhfQ09NUE9ORU5UJDEpIHx8XHJcbiAgICAgICAgKGRlcHRoQXR0YWNobWVudC5yZW5kZXJidWZmZXIgJiZcclxuICAgICAgICAgIGRlcHRoQXR0YWNobWVudC5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlci5mb3JtYXQgPT09IEdMX0RFUFRIX0NPTVBPTkVOVDE2JDEpLFxyXG4gICAgICAgICdpbnZhbGlkIGRlcHRoIGF0dGFjaG1lbnQgZm9yIGZyYW1lYnVmZmVyIG9iamVjdCcpO1xyXG4gICAgICBpbmNSZWZBbmRDaGVja1NoYXBlKHN0ZW5jaWxBdHRhY2htZW50LCB3aWR0aCwgaGVpZ2h0KTtcclxuICAgICAgY2hlY2skMSghc3RlbmNpbEF0dGFjaG1lbnQgfHxcclxuICAgICAgICAoc3RlbmNpbEF0dGFjaG1lbnQucmVuZGVyYnVmZmVyICYmXHJcbiAgICAgICAgICBzdGVuY2lsQXR0YWNobWVudC5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlci5mb3JtYXQgPT09IEdMX1NURU5DSUxfSU5ERVg4JDEpLFxyXG4gICAgICAgICdpbnZhbGlkIHN0ZW5jaWwgYXR0YWNobWVudCBmb3IgZnJhbWVidWZmZXIgb2JqZWN0Jyk7XHJcbiAgICAgIGluY1JlZkFuZENoZWNrU2hhcGUoZGVwdGhTdGVuY2lsQXR0YWNobWVudCwgd2lkdGgsIGhlaWdodCk7XHJcbiAgICAgIGNoZWNrJDEoIWRlcHRoU3RlbmNpbEF0dGFjaG1lbnQgfHxcclxuICAgICAgICAoZGVwdGhTdGVuY2lsQXR0YWNobWVudC50ZXh0dXJlICYmXHJcbiAgICAgICAgICBkZXB0aFN0ZW5jaWxBdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmUuZm9ybWF0ID09PSBHTF9ERVBUSF9TVEVOQ0lMJDIpIHx8XHJcbiAgICAgICAgKGRlcHRoU3RlbmNpbEF0dGFjaG1lbnQucmVuZGVyYnVmZmVyICYmXHJcbiAgICAgICAgICBkZXB0aFN0ZW5jaWxBdHRhY2htZW50LnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyLmZvcm1hdCA9PT0gR0xfREVQVEhfU1RFTkNJTCQyKSxcclxuICAgICAgICAnaW52YWxpZCBkZXB0aC1zdGVuY2lsIGF0dGFjaG1lbnQgZm9yIGZyYW1lYnVmZmVyIG9iamVjdCcpO1xyXG5cclxuICAgICAgLy8gZGVjcmVtZW50IHJlZmVyZW5jZXNcclxuICAgICAgZGVjRkJPUmVmcyhmcmFtZWJ1ZmZlcik7XHJcblxyXG4gICAgICBmcmFtZWJ1ZmZlci53aWR0aCA9IHdpZHRoO1xyXG4gICAgICBmcmFtZWJ1ZmZlci5oZWlnaHQgPSBoZWlnaHQ7XHJcblxyXG4gICAgICBmcmFtZWJ1ZmZlci5jb2xvckF0dGFjaG1lbnRzID0gY29sb3JBdHRhY2htZW50cztcclxuICAgICAgZnJhbWVidWZmZXIuZGVwdGhBdHRhY2htZW50ID0gZGVwdGhBdHRhY2htZW50O1xyXG4gICAgICBmcmFtZWJ1ZmZlci5zdGVuY2lsQXR0YWNobWVudCA9IHN0ZW5jaWxBdHRhY2htZW50O1xyXG4gICAgICBmcmFtZWJ1ZmZlci5kZXB0aFN0ZW5jaWxBdHRhY2htZW50ID0gZGVwdGhTdGVuY2lsQXR0YWNobWVudDtcclxuXHJcbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5jb2xvciA9IGNvbG9yQXR0YWNobWVudHMubWFwKHVud3JhcEF0dGFjaG1lbnQpO1xyXG4gICAgICByZWdsRnJhbWVidWZmZXIuZGVwdGggPSB1bndyYXBBdHRhY2htZW50KGRlcHRoQXR0YWNobWVudCk7XHJcbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5zdGVuY2lsID0gdW53cmFwQXR0YWNobWVudChzdGVuY2lsQXR0YWNobWVudCk7XHJcbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5kZXB0aFN0ZW5jaWwgPSB1bndyYXBBdHRhY2htZW50KGRlcHRoU3RlbmNpbEF0dGFjaG1lbnQpO1xyXG5cclxuICAgICAgcmVnbEZyYW1lYnVmZmVyLndpZHRoID0gZnJhbWVidWZmZXIud2lkdGg7XHJcbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5oZWlnaHQgPSBmcmFtZWJ1ZmZlci5oZWlnaHQ7XHJcblxyXG4gICAgICB1cGRhdGVGcmFtZWJ1ZmZlcihmcmFtZWJ1ZmZlcik7XHJcblxyXG4gICAgICByZXR1cm4gcmVnbEZyYW1lYnVmZmVyXHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gcmVzaXplICh3XywgaF8pIHtcclxuICAgICAgY2hlY2skMShmcmFtZWJ1ZmZlclN0YXRlLm5leHQgIT09IGZyYW1lYnVmZmVyLFxyXG4gICAgICAgICdjYW4gbm90IHJlc2l6ZSBhIGZyYW1lYnVmZmVyIHdoaWNoIGlzIGN1cnJlbnRseSBpbiB1c2UnKTtcclxuXHJcbiAgICAgIHZhciB3ID0gTWF0aC5tYXgod18gfCAwLCAxKTtcclxuICAgICAgdmFyIGggPSBNYXRoLm1heCgoaF8gfCAwKSB8fCB3LCAxKTtcclxuICAgICAgaWYgKHcgPT09IGZyYW1lYnVmZmVyLndpZHRoICYmIGggPT09IGZyYW1lYnVmZmVyLmhlaWdodCkge1xyXG4gICAgICAgIHJldHVybiByZWdsRnJhbWVidWZmZXJcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gcmVzaXplIGFsbCBidWZmZXJzXHJcbiAgICAgIHZhciBjb2xvckF0dGFjaG1lbnRzID0gZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50cztcclxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb2xvckF0dGFjaG1lbnRzLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgcmVzaXplQXR0YWNobWVudChjb2xvckF0dGFjaG1lbnRzW2ldLCB3LCBoKTtcclxuICAgICAgfVxyXG4gICAgICByZXNpemVBdHRhY2htZW50KGZyYW1lYnVmZmVyLmRlcHRoQXR0YWNobWVudCwgdywgaCk7XHJcbiAgICAgIHJlc2l6ZUF0dGFjaG1lbnQoZnJhbWVidWZmZXIuc3RlbmNpbEF0dGFjaG1lbnQsIHcsIGgpO1xyXG4gICAgICByZXNpemVBdHRhY2htZW50KGZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQsIHcsIGgpO1xyXG5cclxuICAgICAgZnJhbWVidWZmZXIud2lkdGggPSByZWdsRnJhbWVidWZmZXIud2lkdGggPSB3O1xyXG4gICAgICBmcmFtZWJ1ZmZlci5oZWlnaHQgPSByZWdsRnJhbWVidWZmZXIuaGVpZ2h0ID0gaDtcclxuXHJcbiAgICAgIHVwZGF0ZUZyYW1lYnVmZmVyKGZyYW1lYnVmZmVyKTtcclxuXHJcbiAgICAgIHJldHVybiByZWdsRnJhbWVidWZmZXJcclxuICAgIH1cclxuXHJcbiAgICByZWdsRnJhbWVidWZmZXIoYTAsIGExKTtcclxuXHJcbiAgICByZXR1cm4gZXh0ZW5kKHJlZ2xGcmFtZWJ1ZmZlciwge1xyXG4gICAgICByZXNpemU6IHJlc2l6ZSxcclxuICAgICAgX3JlZ2xUeXBlOiAnZnJhbWVidWZmZXInLFxyXG4gICAgICBfZnJhbWVidWZmZXI6IGZyYW1lYnVmZmVyLFxyXG4gICAgICBkZXN0cm95OiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgZGVzdHJveShmcmFtZWJ1ZmZlcik7XHJcbiAgICAgICAgZGVjRkJPUmVmcyhmcmFtZWJ1ZmZlcik7XHJcbiAgICAgIH0sXHJcbiAgICAgIHVzZTogZnVuY3Rpb24gKGJsb2NrKSB7XHJcbiAgICAgICAgZnJhbWVidWZmZXJTdGF0ZS5zZXRGQk8oe1xyXG4gICAgICAgICAgZnJhbWVidWZmZXI6IHJlZ2xGcmFtZWJ1ZmZlclxyXG4gICAgICAgIH0sIGJsb2NrKTtcclxuICAgICAgfVxyXG4gICAgfSlcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGNyZWF0ZUN1YmVGQk8gKG9wdGlvbnMpIHtcclxuICAgIHZhciBmYWNlcyA9IEFycmF5KDYpO1xyXG5cclxuICAgIGZ1bmN0aW9uIHJlZ2xGcmFtZWJ1ZmZlckN1YmUgKGEpIHtcclxuICAgICAgdmFyIGk7XHJcblxyXG4gICAgICBjaGVjayQxKGZhY2VzLmluZGV4T2YoZnJhbWVidWZmZXJTdGF0ZS5uZXh0KSA8IDAsXHJcbiAgICAgICAgJ2NhbiBub3QgdXBkYXRlIGZyYW1lYnVmZmVyIHdoaWNoIGlzIGN1cnJlbnRseSBpbiB1c2UnKTtcclxuXHJcbiAgICAgIHZhciBwYXJhbXMgPSB7XHJcbiAgICAgICAgY29sb3I6IG51bGxcclxuICAgICAgfTtcclxuXHJcbiAgICAgIHZhciByYWRpdXMgPSAwO1xyXG5cclxuICAgICAgdmFyIGNvbG9yQnVmZmVyID0gbnVsbDtcclxuICAgICAgdmFyIGNvbG9yRm9ybWF0ID0gJ3JnYmEnO1xyXG4gICAgICB2YXIgY29sb3JUeXBlID0gJ3VpbnQ4JztcclxuICAgICAgdmFyIGNvbG9yQ291bnQgPSAxO1xyXG5cclxuICAgICAgaWYgKHR5cGVvZiBhID09PSAnbnVtYmVyJykge1xyXG4gICAgICAgIHJhZGl1cyA9IGEgfCAwO1xyXG4gICAgICB9IGVsc2UgaWYgKCFhKSB7XHJcbiAgICAgICAgcmFkaXVzID0gMTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBjaGVjayQxLnR5cGUoYSwgJ29iamVjdCcsICdpbnZhbGlkIGFyZ3VtZW50cyBmb3IgZnJhbWVidWZmZXInKTtcclxuICAgICAgICB2YXIgb3B0aW9ucyA9IGE7XHJcblxyXG4gICAgICAgIGlmICgnc2hhcGUnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgIHZhciBzaGFwZSA9IG9wdGlvbnMuc2hhcGU7XHJcbiAgICAgICAgICBjaGVjayQxKFxyXG4gICAgICAgICAgICBBcnJheS5pc0FycmF5KHNoYXBlKSAmJiBzaGFwZS5sZW5ndGggPj0gMixcclxuICAgICAgICAgICAgJ2ludmFsaWQgc2hhcGUgZm9yIGZyYW1lYnVmZmVyJyk7XHJcbiAgICAgICAgICBjaGVjayQxKFxyXG4gICAgICAgICAgICBzaGFwZVswXSA9PT0gc2hhcGVbMV0sXHJcbiAgICAgICAgICAgICdjdWJlIGZyYW1lYnVmZmVyIG11c3QgYmUgc3F1YXJlJyk7XHJcbiAgICAgICAgICByYWRpdXMgPSBzaGFwZVswXTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgaWYgKCdyYWRpdXMnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgICAgcmFkaXVzID0gb3B0aW9ucy5yYWRpdXMgfCAwO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgaWYgKCd3aWR0aCcgaW4gb3B0aW9ucykge1xyXG4gICAgICAgICAgICByYWRpdXMgPSBvcHRpb25zLndpZHRoIHwgMDtcclxuICAgICAgICAgICAgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgICAgICBjaGVjayQxKG9wdGlvbnMuaGVpZ2h0ID09PSByYWRpdXMsICdtdXN0IGJlIHNxdWFyZScpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9IGVsc2UgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgICAgcmFkaXVzID0gb3B0aW9ucy5oZWlnaHQgfCAwO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKCdjb2xvcicgaW4gb3B0aW9ucyB8fFxyXG4gICAgICAgICAgICAnY29sb3JzJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgICBjb2xvckJ1ZmZlciA9XHJcbiAgICAgICAgICAgIG9wdGlvbnMuY29sb3IgfHxcclxuICAgICAgICAgICAgb3B0aW9ucy5jb2xvcnM7XHJcbiAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShjb2xvckJ1ZmZlcikpIHtcclxuICAgICAgICAgICAgY2hlY2skMShcclxuICAgICAgICAgICAgICBjb2xvckJ1ZmZlci5sZW5ndGggPT09IDEgfHwgZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnMsXHJcbiAgICAgICAgICAgICAgJ211bHRpcGxlIHJlbmRlciB0YXJnZXRzIG5vdCBzdXBwb3J0ZWQnKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICghY29sb3JCdWZmZXIpIHtcclxuICAgICAgICAgIGlmICgnY29sb3JDb3VudCcgaW4gb3B0aW9ucykge1xyXG4gICAgICAgICAgICBjb2xvckNvdW50ID0gb3B0aW9ucy5jb2xvckNvdW50IHwgMDtcclxuICAgICAgICAgICAgY2hlY2skMShjb2xvckNvdW50ID4gMCwgJ2ludmFsaWQgY29sb3IgYnVmZmVyIGNvdW50Jyk7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgaWYgKCdjb2xvclR5cGUnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgICAgY2hlY2skMS5vbmVPZihcclxuICAgICAgICAgICAgICBvcHRpb25zLmNvbG9yVHlwZSwgY29sb3JUeXBlcyxcclxuICAgICAgICAgICAgICAnaW52YWxpZCBjb2xvciB0eXBlJyk7XHJcbiAgICAgICAgICAgIGNvbG9yVHlwZSA9IG9wdGlvbnMuY29sb3JUeXBlO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIGlmICgnY29sb3JGb3JtYXQnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgICAgY29sb3JGb3JtYXQgPSBvcHRpb25zLmNvbG9yRm9ybWF0O1xyXG4gICAgICAgICAgICBjaGVjayQxLm9uZU9mKFxyXG4gICAgICAgICAgICAgIG9wdGlvbnMuY29sb3JGb3JtYXQsIGNvbG9yVGV4dHVyZUZvcm1hdHMsXHJcbiAgICAgICAgICAgICAgJ2ludmFsaWQgY29sb3IgZm9ybWF0IGZvciB0ZXh0dXJlJyk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoJ2RlcHRoJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgICBwYXJhbXMuZGVwdGggPSBvcHRpb25zLmRlcHRoO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKCdzdGVuY2lsJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgICBwYXJhbXMuc3RlbmNpbCA9IG9wdGlvbnMuc3RlbmNpbDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICgnZGVwdGhTdGVuY2lsJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgICBwYXJhbXMuZGVwdGhTdGVuY2lsID0gb3B0aW9ucy5kZXB0aFN0ZW5jaWw7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICB2YXIgY29sb3JDdWJlcztcclxuICAgICAgaWYgKGNvbG9yQnVmZmVyKSB7XHJcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoY29sb3JCdWZmZXIpKSB7XHJcbiAgICAgICAgICBjb2xvckN1YmVzID0gW107XHJcbiAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JCdWZmZXIubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgY29sb3JDdWJlc1tpXSA9IGNvbG9yQnVmZmVyW2ldO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBjb2xvckN1YmVzID0gWyBjb2xvckJ1ZmZlciBdO1xyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBjb2xvckN1YmVzID0gQXJyYXkoY29sb3JDb3VudCk7XHJcbiAgICAgICAgdmFyIGN1YmVNYXBQYXJhbXMgPSB7XHJcbiAgICAgICAgICByYWRpdXM6IHJhZGl1cyxcclxuICAgICAgICAgIGZvcm1hdDogY29sb3JGb3JtYXQsXHJcbiAgICAgICAgICB0eXBlOiBjb2xvclR5cGVcclxuICAgICAgICB9O1xyXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckNvdW50OyArK2kpIHtcclxuICAgICAgICAgIGNvbG9yQ3ViZXNbaV0gPSB0ZXh0dXJlU3RhdGUuY3JlYXRlQ3ViZShjdWJlTWFwUGFyYW1zKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIENoZWNrIGNvbG9yIGN1YmVzXHJcbiAgICAgIHBhcmFtcy5jb2xvciA9IEFycmF5KGNvbG9yQ3ViZXMubGVuZ3RoKTtcclxuICAgICAgZm9yIChpID0gMDsgaSA8IGNvbG9yQ3ViZXMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICB2YXIgY3ViZSA9IGNvbG9yQ3ViZXNbaV07XHJcbiAgICAgICAgY2hlY2skMShcclxuICAgICAgICAgIHR5cGVvZiBjdWJlID09PSAnZnVuY3Rpb24nICYmIGN1YmUuX3JlZ2xUeXBlID09PSAndGV4dHVyZUN1YmUnLFxyXG4gICAgICAgICAgJ2ludmFsaWQgY3ViZSBtYXAnKTtcclxuICAgICAgICByYWRpdXMgPSByYWRpdXMgfHwgY3ViZS53aWR0aDtcclxuICAgICAgICBjaGVjayQxKFxyXG4gICAgICAgICAgY3ViZS53aWR0aCA9PT0gcmFkaXVzICYmIGN1YmUuaGVpZ2h0ID09PSByYWRpdXMsXHJcbiAgICAgICAgICAnaW52YWxpZCBjdWJlIG1hcCBzaGFwZScpO1xyXG4gICAgICAgIHBhcmFtcy5jb2xvcltpXSA9IHtcclxuICAgICAgICAgIHRhcmdldDogR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YJDIsXHJcbiAgICAgICAgICBkYXRhOiBjb2xvckN1YmVzW2ldXHJcbiAgICAgICAgfTtcclxuICAgICAgfVxyXG5cclxuICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xyXG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgY29sb3JDdWJlcy5sZW5ndGg7ICsraikge1xyXG4gICAgICAgICAgcGFyYW1zLmNvbG9yW2pdLnRhcmdldCA9IEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCQyICsgaTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gcmV1c2UgZGVwdGgtc3RlbmNpbCBhdHRhY2htZW50cyBhY3Jvc3MgYWxsIGN1YmUgbWFwc1xyXG4gICAgICAgIGlmIChpID4gMCkge1xyXG4gICAgICAgICAgcGFyYW1zLmRlcHRoID0gZmFjZXNbMF0uZGVwdGg7XHJcbiAgICAgICAgICBwYXJhbXMuc3RlbmNpbCA9IGZhY2VzWzBdLnN0ZW5jaWw7XHJcbiAgICAgICAgICBwYXJhbXMuZGVwdGhTdGVuY2lsID0gZmFjZXNbMF0uZGVwdGhTdGVuY2lsO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoZmFjZXNbaV0pIHtcclxuICAgICAgICAgIChmYWNlc1tpXSkocGFyYW1zKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgZmFjZXNbaV0gPSBjcmVhdGVGQk8ocGFyYW1zKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiBleHRlbmQocmVnbEZyYW1lYnVmZmVyQ3ViZSwge1xyXG4gICAgICAgIHdpZHRoOiByYWRpdXMsXHJcbiAgICAgICAgaGVpZ2h0OiByYWRpdXMsXHJcbiAgICAgICAgY29sb3I6IGNvbG9yQ3ViZXNcclxuICAgICAgfSlcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiByZXNpemUgKHJhZGl1c18pIHtcclxuICAgICAgdmFyIGk7XHJcbiAgICAgIHZhciByYWRpdXMgPSByYWRpdXNfIHwgMDtcclxuICAgICAgY2hlY2skMShyYWRpdXMgPiAwICYmIHJhZGl1cyA8PSBsaW1pdHMubWF4Q3ViZU1hcFNpemUsXHJcbiAgICAgICAgJ2ludmFsaWQgcmFkaXVzIGZvciBjdWJlIGZibycpO1xyXG5cclxuICAgICAgaWYgKHJhZGl1cyA9PT0gcmVnbEZyYW1lYnVmZmVyQ3ViZS53aWR0aCkge1xyXG4gICAgICAgIHJldHVybiByZWdsRnJhbWVidWZmZXJDdWJlXHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHZhciBjb2xvcnMgPSByZWdsRnJhbWVidWZmZXJDdWJlLmNvbG9yO1xyXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JzLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgY29sb3JzW2ldLnJlc2l6ZShyYWRpdXMpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XHJcbiAgICAgICAgZmFjZXNbaV0ucmVzaXplKHJhZGl1cyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlckN1YmUud2lkdGggPSByZWdsRnJhbWVidWZmZXJDdWJlLmhlaWdodCA9IHJhZGl1cztcclxuXHJcbiAgICAgIHJldHVybiByZWdsRnJhbWVidWZmZXJDdWJlXHJcbiAgICB9XHJcblxyXG4gICAgcmVnbEZyYW1lYnVmZmVyQ3ViZShvcHRpb25zKTtcclxuXHJcbiAgICByZXR1cm4gZXh0ZW5kKHJlZ2xGcmFtZWJ1ZmZlckN1YmUsIHtcclxuICAgICAgZmFjZXM6IGZhY2VzLFxyXG4gICAgICByZXNpemU6IHJlc2l6ZSxcclxuICAgICAgX3JlZ2xUeXBlOiAnZnJhbWVidWZmZXJDdWJlJyxcclxuICAgICAgZGVzdHJveTogZnVuY3Rpb24gKCkge1xyXG4gICAgICAgIGZhY2VzLmZvckVhY2goZnVuY3Rpb24gKGYpIHtcclxuICAgICAgICAgIGYuZGVzdHJveSgpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICB9KVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gcmVzdG9yZUZyYW1lYnVmZmVycyAoKSB7XHJcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLmN1ciA9IG51bGw7XHJcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLm5leHQgPSBudWxsO1xyXG4gICAgZnJhbWVidWZmZXJTdGF0ZS5kaXJ0eSA9IHRydWU7XHJcbiAgICB2YWx1ZXMoZnJhbWVidWZmZXJTZXQpLmZvckVhY2goZnVuY3Rpb24gKGZiKSB7XHJcbiAgICAgIGZiLmZyYW1lYnVmZmVyID0gZ2wuY3JlYXRlRnJhbWVidWZmZXIoKTtcclxuICAgICAgdXBkYXRlRnJhbWVidWZmZXIoZmIpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICByZXR1cm4gZXh0ZW5kKGZyYW1lYnVmZmVyU3RhdGUsIHtcclxuICAgIGdldEZyYW1lYnVmZmVyOiBmdW5jdGlvbiAob2JqZWN0KSB7XHJcbiAgICAgIGlmICh0eXBlb2Ygb2JqZWN0ID09PSAnZnVuY3Rpb24nICYmIG9iamVjdC5fcmVnbFR5cGUgPT09ICdmcmFtZWJ1ZmZlcicpIHtcclxuICAgICAgICB2YXIgZmJvID0gb2JqZWN0Ll9mcmFtZWJ1ZmZlcjtcclxuICAgICAgICBpZiAoZmJvIGluc3RhbmNlb2YgUkVHTEZyYW1lYnVmZmVyKSB7XHJcbiAgICAgICAgICByZXR1cm4gZmJvXHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBudWxsXHJcbiAgICB9LFxyXG4gICAgY3JlYXRlOiBjcmVhdGVGQk8sXHJcbiAgICBjcmVhdGVDdWJlOiBjcmVhdGVDdWJlRkJPLFxyXG4gICAgY2xlYXI6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgdmFsdWVzKGZyYW1lYnVmZmVyU2V0KS5mb3JFYWNoKGRlc3Ryb3kpO1xyXG4gICAgfSxcclxuICAgIHJlc3RvcmU6IHJlc3RvcmVGcmFtZWJ1ZmZlcnNcclxuICB9KVxyXG59XG5cbnZhciBHTF9GTE9BVCQ2ID0gNTEyNjtcclxuXHJcbmZ1bmN0aW9uIEF0dHJpYnV0ZVJlY29yZCAoKSB7XHJcbiAgdGhpcy5zdGF0ZSA9IDA7XHJcblxyXG4gIHRoaXMueCA9IDAuMDtcclxuICB0aGlzLnkgPSAwLjA7XHJcbiAgdGhpcy56ID0gMC4wO1xyXG4gIHRoaXMudyA9IDAuMDtcclxuXHJcbiAgdGhpcy5idWZmZXIgPSBudWxsO1xyXG4gIHRoaXMuc2l6ZSA9IDA7XHJcbiAgdGhpcy5ub3JtYWxpemVkID0gZmFsc2U7XHJcbiAgdGhpcy50eXBlID0gR0xfRkxPQVQkNjtcclxuICB0aGlzLm9mZnNldCA9IDA7XHJcbiAgdGhpcy5zdHJpZGUgPSAwO1xyXG4gIHRoaXMuZGl2aXNvciA9IDA7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHdyYXBBdHRyaWJ1dGVTdGF0ZSAoXHJcbiAgZ2wsXHJcbiAgZXh0ZW5zaW9ucyxcclxuICBsaW1pdHMsXHJcbiAgc3RyaW5nU3RvcmUpIHtcclxuICB2YXIgTlVNX0FUVFJJQlVURVMgPSBsaW1pdHMubWF4QXR0cmlidXRlcztcclxuICB2YXIgYXR0cmlidXRlQmluZGluZ3MgPSBuZXcgQXJyYXkoTlVNX0FUVFJJQlVURVMpO1xyXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgTlVNX0FUVFJJQlVURVM7ICsraSkge1xyXG4gICAgYXR0cmlidXRlQmluZGluZ3NbaV0gPSBuZXcgQXR0cmlidXRlUmVjb3JkKCk7XHJcbiAgfVxyXG5cclxuICByZXR1cm4ge1xyXG4gICAgUmVjb3JkOiBBdHRyaWJ1dGVSZWNvcmQsXHJcbiAgICBzY29wZToge30sXHJcbiAgICBzdGF0ZTogYXR0cmlidXRlQmluZGluZ3NcclxuICB9XHJcbn1cblxudmFyIEdMX0ZSQUdNRU5UX1NIQURFUiA9IDM1NjMyO1xyXG52YXIgR0xfVkVSVEVYX1NIQURFUiA9IDM1NjMzO1xyXG5cclxudmFyIEdMX0FDVElWRV9VTklGT1JNUyA9IDB4OEI4NjtcclxudmFyIEdMX0FDVElWRV9BVFRSSUJVVEVTID0gMHg4Qjg5O1xyXG5cclxuZnVuY3Rpb24gd3JhcFNoYWRlclN0YXRlIChnbCwgc3RyaW5nU3RvcmUsIHN0YXRzLCBjb25maWcpIHtcclxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAvLyBnbHNsIGNvbXBpbGF0aW9uIGFuZCBsaW5raW5nXHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgdmFyIGZyYWdTaGFkZXJzID0ge307XHJcbiAgdmFyIHZlcnRTaGFkZXJzID0ge307XHJcblxyXG4gIGZ1bmN0aW9uIEFjdGl2ZUluZm8gKG5hbWUsIGlkLCBsb2NhdGlvbiwgaW5mbykge1xyXG4gICAgdGhpcy5uYW1lID0gbmFtZTtcclxuICAgIHRoaXMuaWQgPSBpZDtcclxuICAgIHRoaXMubG9jYXRpb24gPSBsb2NhdGlvbjtcclxuICAgIHRoaXMuaW5mbyA9IGluZm87XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBpbnNlcnRBY3RpdmVJbmZvIChsaXN0LCBpbmZvKSB7XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyArK2kpIHtcclxuICAgICAgaWYgKGxpc3RbaV0uaWQgPT09IGluZm8uaWQpIHtcclxuICAgICAgICBsaXN0W2ldLmxvY2F0aW9uID0gaW5mby5sb2NhdGlvbjtcclxuICAgICAgICByZXR1cm5cclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgbGlzdC5wdXNoKGluZm8pO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZ2V0U2hhZGVyICh0eXBlLCBpZCwgY29tbWFuZCkge1xyXG4gICAgdmFyIGNhY2hlID0gdHlwZSA9PT0gR0xfRlJBR01FTlRfU0hBREVSID8gZnJhZ1NoYWRlcnMgOiB2ZXJ0U2hhZGVycztcclxuICAgIHZhciBzaGFkZXIgPSBjYWNoZVtpZF07XHJcblxyXG4gICAgaWYgKCFzaGFkZXIpIHtcclxuICAgICAgdmFyIHNvdXJjZSA9IHN0cmluZ1N0b3JlLnN0cihpZCk7XHJcbiAgICAgIHNoYWRlciA9IGdsLmNyZWF0ZVNoYWRlcih0eXBlKTtcclxuICAgICAgZ2wuc2hhZGVyU291cmNlKHNoYWRlciwgc291cmNlKTtcclxuICAgICAgZ2wuY29tcGlsZVNoYWRlcihzaGFkZXIpO1xyXG4gICAgICBjaGVjayQxLnNoYWRlckVycm9yKGdsLCBzaGFkZXIsIHNvdXJjZSwgdHlwZSwgY29tbWFuZCk7XHJcbiAgICAgIGNhY2hlW2lkXSA9IHNoYWRlcjtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gc2hhZGVyXHJcbiAgfVxyXG5cclxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAvLyBwcm9ncmFtIGxpbmtpbmdcclxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICB2YXIgcHJvZ3JhbUNhY2hlID0ge307XHJcbiAgdmFyIHByb2dyYW1MaXN0ID0gW107XHJcblxyXG4gIHZhciBQUk9HUkFNX0NPVU5URVIgPSAwO1xyXG5cclxuICBmdW5jdGlvbiBSRUdMUHJvZ3JhbSAoZnJhZ0lkLCB2ZXJ0SWQpIHtcclxuICAgIHRoaXMuaWQgPSBQUk9HUkFNX0NPVU5URVIrKztcclxuICAgIHRoaXMuZnJhZ0lkID0gZnJhZ0lkO1xyXG4gICAgdGhpcy52ZXJ0SWQgPSB2ZXJ0SWQ7XHJcbiAgICB0aGlzLnByb2dyYW0gPSBudWxsO1xyXG4gICAgdGhpcy51bmlmb3JtcyA9IFtdO1xyXG4gICAgdGhpcy5hdHRyaWJ1dGVzID0gW107XHJcblxyXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XHJcbiAgICAgIHRoaXMuc3RhdHMgPSB7XHJcbiAgICAgICAgdW5pZm9ybXNDb3VudDogMCxcclxuICAgICAgICBhdHRyaWJ1dGVzQ291bnQ6IDBcclxuICAgICAgfTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGxpbmtQcm9ncmFtIChkZXNjLCBjb21tYW5kKSB7XHJcbiAgICB2YXIgaSwgaW5mbztcclxuXHJcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgICAvLyBjb21waWxlICYgbGlua1xyXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gICAgdmFyIGZyYWdTaGFkZXIgPSBnZXRTaGFkZXIoR0xfRlJBR01FTlRfU0hBREVSLCBkZXNjLmZyYWdJZCk7XHJcbiAgICB2YXIgdmVydFNoYWRlciA9IGdldFNoYWRlcihHTF9WRVJURVhfU0hBREVSLCBkZXNjLnZlcnRJZCk7XHJcblxyXG4gICAgdmFyIHByb2dyYW0gPSBkZXNjLnByb2dyYW0gPSBnbC5jcmVhdGVQcm9ncmFtKCk7XHJcbiAgICBnbC5hdHRhY2hTaGFkZXIocHJvZ3JhbSwgZnJhZ1NoYWRlcik7XHJcbiAgICBnbC5hdHRhY2hTaGFkZXIocHJvZ3JhbSwgdmVydFNoYWRlcik7XHJcbiAgICBnbC5saW5rUHJvZ3JhbShwcm9ncmFtKTtcclxuICAgIGNoZWNrJDEubGlua0Vycm9yKFxyXG4gICAgICBnbCxcclxuICAgICAgcHJvZ3JhbSxcclxuICAgICAgc3RyaW5nU3RvcmUuc3RyKGRlc2MuZnJhZ0lkKSxcclxuICAgICAgc3RyaW5nU3RvcmUuc3RyKGRlc2MudmVydElkKSxcclxuICAgICAgY29tbWFuZCk7XHJcblxyXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gICAgLy8gZ3JhYiB1bmlmb3Jtc1xyXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gICAgdmFyIG51bVVuaWZvcm1zID0gZ2wuZ2V0UHJvZ3JhbVBhcmFtZXRlcihwcm9ncmFtLCBHTF9BQ1RJVkVfVU5JRk9STVMpO1xyXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XHJcbiAgICAgIGRlc2Muc3RhdHMudW5pZm9ybXNDb3VudCA9IG51bVVuaWZvcm1zO1xyXG4gICAgfVxyXG4gICAgdmFyIHVuaWZvcm1zID0gZGVzYy51bmlmb3JtcztcclxuICAgIGZvciAoaSA9IDA7IGkgPCBudW1Vbmlmb3JtczsgKytpKSB7XHJcbiAgICAgIGluZm8gPSBnbC5nZXRBY3RpdmVVbmlmb3JtKHByb2dyYW0sIGkpO1xyXG4gICAgICBpZiAoaW5mbykge1xyXG4gICAgICAgIGlmIChpbmZvLnNpemUgPiAxKSB7XHJcbiAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGluZm8uc2l6ZTsgKytqKSB7XHJcbiAgICAgICAgICAgIHZhciBuYW1lID0gaW5mby5uYW1lLnJlcGxhY2UoJ1swXScsICdbJyArIGogKyAnXScpO1xyXG4gICAgICAgICAgICBpbnNlcnRBY3RpdmVJbmZvKHVuaWZvcm1zLCBuZXcgQWN0aXZlSW5mbyhcclxuICAgICAgICAgICAgICBuYW1lLFxyXG4gICAgICAgICAgICAgIHN0cmluZ1N0b3JlLmlkKG5hbWUpLFxyXG4gICAgICAgICAgICAgIGdsLmdldFVuaWZvcm1Mb2NhdGlvbihwcm9ncmFtLCBuYW1lKSxcclxuICAgICAgICAgICAgICBpbmZvKSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGluc2VydEFjdGl2ZUluZm8odW5pZm9ybXMsIG5ldyBBY3RpdmVJbmZvKFxyXG4gICAgICAgICAgICBpbmZvLm5hbWUsXHJcbiAgICAgICAgICAgIHN0cmluZ1N0b3JlLmlkKGluZm8ubmFtZSksXHJcbiAgICAgICAgICAgIGdsLmdldFVuaWZvcm1Mb2NhdGlvbihwcm9ncmFtLCBpbmZvLm5hbWUpLFxyXG4gICAgICAgICAgICBpbmZvKSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gICAgLy8gZ3JhYiBhdHRyaWJ1dGVzXHJcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgICB2YXIgbnVtQXR0cmlidXRlcyA9IGdsLmdldFByb2dyYW1QYXJhbWV0ZXIocHJvZ3JhbSwgR0xfQUNUSVZFX0FUVFJJQlVURVMpO1xyXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XHJcbiAgICAgIGRlc2Muc3RhdHMuYXR0cmlidXRlc0NvdW50ID0gbnVtQXR0cmlidXRlcztcclxuICAgIH1cclxuXHJcbiAgICB2YXIgYXR0cmlidXRlcyA9IGRlc2MuYXR0cmlidXRlcztcclxuICAgIGZvciAoaSA9IDA7IGkgPCBudW1BdHRyaWJ1dGVzOyArK2kpIHtcclxuICAgICAgaW5mbyA9IGdsLmdldEFjdGl2ZUF0dHJpYihwcm9ncmFtLCBpKTtcclxuICAgICAgaWYgKGluZm8pIHtcclxuICAgICAgICBpbnNlcnRBY3RpdmVJbmZvKGF0dHJpYnV0ZXMsIG5ldyBBY3RpdmVJbmZvKFxyXG4gICAgICAgICAgaW5mby5uYW1lLFxyXG4gICAgICAgICAgc3RyaW5nU3RvcmUuaWQoaW5mby5uYW1lKSxcclxuICAgICAgICAgIGdsLmdldEF0dHJpYkxvY2F0aW9uKHByb2dyYW0sIGluZm8ubmFtZSksXHJcbiAgICAgICAgICBpbmZvKSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIGlmIChjb25maWcucHJvZmlsZSkge1xyXG4gICAgc3RhdHMuZ2V0TWF4VW5pZm9ybXNDb3VudCA9IGZ1bmN0aW9uICgpIHtcclxuICAgICAgdmFyIG0gPSAwO1xyXG4gICAgICBwcm9ncmFtTGlzdC5mb3JFYWNoKGZ1bmN0aW9uIChkZXNjKSB7XHJcbiAgICAgICAgaWYgKGRlc2Muc3RhdHMudW5pZm9ybXNDb3VudCA+IG0pIHtcclxuICAgICAgICAgIG0gPSBkZXNjLnN0YXRzLnVuaWZvcm1zQ291bnQ7XHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuICAgICAgcmV0dXJuIG1cclxuICAgIH07XHJcblxyXG4gICAgc3RhdHMuZ2V0TWF4QXR0cmlidXRlc0NvdW50ID0gZnVuY3Rpb24gKCkge1xyXG4gICAgICB2YXIgbSA9IDA7XHJcbiAgICAgIHByb2dyYW1MaXN0LmZvckVhY2goZnVuY3Rpb24gKGRlc2MpIHtcclxuICAgICAgICBpZiAoZGVzYy5zdGF0cy5hdHRyaWJ1dGVzQ291bnQgPiBtKSB7XHJcbiAgICAgICAgICBtID0gZGVzYy5zdGF0cy5hdHRyaWJ1dGVzQ291bnQ7XHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuICAgICAgcmV0dXJuIG1cclxuICAgIH07XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiByZXN0b3JlU2hhZGVycyAoKSB7XHJcbiAgICBmcmFnU2hhZGVycyA9IHt9O1xyXG4gICAgdmVydFNoYWRlcnMgPSB7fTtcclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcHJvZ3JhbUxpc3QubGVuZ3RoOyArK2kpIHtcclxuICAgICAgbGlua1Byb2dyYW0ocHJvZ3JhbUxpc3RbaV0pO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIGNsZWFyOiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgIHZhciBkZWxldGVTaGFkZXIgPSBnbC5kZWxldGVTaGFkZXIuYmluZChnbCk7XHJcbiAgICAgIHZhbHVlcyhmcmFnU2hhZGVycykuZm9yRWFjaChkZWxldGVTaGFkZXIpO1xyXG4gICAgICBmcmFnU2hhZGVycyA9IHt9O1xyXG4gICAgICB2YWx1ZXModmVydFNoYWRlcnMpLmZvckVhY2goZGVsZXRlU2hhZGVyKTtcclxuICAgICAgdmVydFNoYWRlcnMgPSB7fTtcclxuXHJcbiAgICAgIHByb2dyYW1MaXN0LmZvckVhY2goZnVuY3Rpb24gKGRlc2MpIHtcclxuICAgICAgICBnbC5kZWxldGVQcm9ncmFtKGRlc2MucHJvZ3JhbSk7XHJcbiAgICAgIH0pO1xyXG4gICAgICBwcm9ncmFtTGlzdC5sZW5ndGggPSAwO1xyXG4gICAgICBwcm9ncmFtQ2FjaGUgPSB7fTtcclxuXHJcbiAgICAgIHN0YXRzLnNoYWRlckNvdW50ID0gMDtcclxuICAgIH0sXHJcblxyXG4gICAgcHJvZ3JhbTogZnVuY3Rpb24gKHZlcnRJZCwgZnJhZ0lkLCBjb21tYW5kKSB7XHJcbiAgICAgIGNoZWNrJDEuY29tbWFuZCh2ZXJ0SWQgPj0gMCwgJ21pc3NpbmcgdmVydGV4IHNoYWRlcicsIGNvbW1hbmQpO1xyXG4gICAgICBjaGVjayQxLmNvbW1hbmQoZnJhZ0lkID49IDAsICdtaXNzaW5nIGZyYWdtZW50IHNoYWRlcicsIGNvbW1hbmQpO1xyXG5cclxuICAgICAgdmFyIGNhY2hlID0gcHJvZ3JhbUNhY2hlW2ZyYWdJZF07XHJcbiAgICAgIGlmICghY2FjaGUpIHtcclxuICAgICAgICBjYWNoZSA9IHByb2dyYW1DYWNoZVtmcmFnSWRdID0ge307XHJcbiAgICAgIH1cclxuICAgICAgdmFyIHByb2dyYW0gPSBjYWNoZVt2ZXJ0SWRdO1xyXG4gICAgICBpZiAoIXByb2dyYW0pIHtcclxuICAgICAgICBwcm9ncmFtID0gbmV3IFJFR0xQcm9ncmFtKGZyYWdJZCwgdmVydElkKTtcclxuICAgICAgICBzdGF0cy5zaGFkZXJDb3VudCsrO1xyXG5cclxuICAgICAgICBsaW5rUHJvZ3JhbShwcm9ncmFtLCBjb21tYW5kKTtcclxuICAgICAgICBjYWNoZVt2ZXJ0SWRdID0gcHJvZ3JhbTtcclxuICAgICAgICBwcm9ncmFtTGlzdC5wdXNoKHByb2dyYW0pO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBwcm9ncmFtXHJcbiAgICB9LFxyXG5cclxuICAgIHJlc3RvcmU6IHJlc3RvcmVTaGFkZXJzLFxyXG5cclxuICAgIHNoYWRlcjogZ2V0U2hhZGVyLFxyXG5cclxuICAgIGZyYWc6IC0xLFxyXG4gICAgdmVydDogLTFcclxuICB9XHJcbn1cblxudmFyIEdMX1JHQkEkMyA9IDY0MDg7XHJcbnZhciBHTF9VTlNJR05FRF9CWVRFJDcgPSA1MTIxO1xyXG52YXIgR0xfUEFDS19BTElHTk1FTlQgPSAweDBEMDU7XHJcbnZhciBHTF9GTE9BVCQ3ID0gMHgxNDA2OyAvLyA1MTI2XHJcblxyXG5mdW5jdGlvbiB3cmFwUmVhZFBpeGVscyAoXHJcbiAgZ2wsXHJcbiAgZnJhbWVidWZmZXJTdGF0ZSxcclxuICByZWdsUG9sbCxcclxuICBjb250ZXh0LFxyXG4gIGdsQXR0cmlidXRlcyxcclxuICBleHRlbnNpb25zLFxyXG4gIGxpbWl0cykge1xyXG4gIGZ1bmN0aW9uIHJlYWRQaXhlbHNJbXBsIChpbnB1dCkge1xyXG4gICAgdmFyIHR5cGU7XHJcbiAgICBpZiAoZnJhbWVidWZmZXJTdGF0ZS5uZXh0ID09PSBudWxsKSB7XHJcbiAgICAgIGNoZWNrJDEoXHJcbiAgICAgICAgZ2xBdHRyaWJ1dGVzLnByZXNlcnZlRHJhd2luZ0J1ZmZlcixcclxuICAgICAgICAneW91IG11c3QgY3JlYXRlIGEgd2ViZ2wgY29udGV4dCB3aXRoIFwicHJlc2VydmVEcmF3aW5nQnVmZmVyXCI6dHJ1ZSBpbiBvcmRlciB0byByZWFkIHBpeGVscyBmcm9tIHRoZSBkcmF3aW5nIGJ1ZmZlcicpO1xyXG4gICAgICB0eXBlID0gR0xfVU5TSUdORURfQllURSQ3O1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY2hlY2skMShcclxuICAgICAgICBmcmFtZWJ1ZmZlclN0YXRlLm5leHQuY29sb3JBdHRhY2htZW50c1swXS50ZXh0dXJlICE9PSBudWxsLFxyXG4gICAgICAgICAgJ1lvdSBjYW5ub3QgcmVhZCBmcm9tIGEgcmVuZGVyYnVmZmVyJyk7XHJcbiAgICAgIHR5cGUgPSBmcmFtZWJ1ZmZlclN0YXRlLm5leHQuY29sb3JBdHRhY2htZW50c1swXS50ZXh0dXJlLl90ZXh0dXJlLnR5cGU7XHJcblxyXG4gICAgICBpZiAoZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9mbG9hdCkge1xyXG4gICAgICAgIGNoZWNrJDEoXHJcbiAgICAgICAgICB0eXBlID09PSBHTF9VTlNJR05FRF9CWVRFJDcgfHwgdHlwZSA9PT0gR0xfRkxPQVQkNyxcclxuICAgICAgICAgICdSZWFkaW5nIGZyb20gYSBmcmFtZWJ1ZmZlciBpcyBvbmx5IGFsbG93ZWQgZm9yIHRoZSB0eXBlcyBcXCd1aW50OFxcJyBhbmQgXFwnZmxvYXRcXCcnKTtcclxuXHJcbiAgICAgICAgaWYgKHR5cGUgPT09IEdMX0ZMT0FUJDcpIHtcclxuICAgICAgICAgIGNoZWNrJDEobGltaXRzLnJlYWRGbG9hdCwgJ1JlYWRpbmcgXFwnZmxvYXRcXCcgdmFsdWVzIGlzIG5vdCBwZXJtaXR0ZWQgaW4geW91ciBicm93c2VyLiBGb3IgYSBmYWxsYmFjaywgcGxlYXNlIHNlZTogaHR0cHM6Ly93d3cubnBtanMuY29tL3BhY2thZ2UvZ2xzbC1yZWFkLWZsb2F0Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNoZWNrJDEoXHJcbiAgICAgICAgICB0eXBlID09PSBHTF9VTlNJR05FRF9CWVRFJDcsXHJcbiAgICAgICAgICAnUmVhZGluZyBmcm9tIGEgZnJhbWVidWZmZXIgaXMgb25seSBhbGxvd2VkIGZvciB0aGUgdHlwZSBcXCd1aW50OFxcJycpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIHggPSAwO1xyXG4gICAgdmFyIHkgPSAwO1xyXG4gICAgdmFyIHdpZHRoID0gY29udGV4dC5mcmFtZWJ1ZmZlcldpZHRoO1xyXG4gICAgdmFyIGhlaWdodCA9IGNvbnRleHQuZnJhbWVidWZmZXJIZWlnaHQ7XHJcbiAgICB2YXIgZGF0YSA9IG51bGw7XHJcblxyXG4gICAgaWYgKGlzVHlwZWRBcnJheShpbnB1dCkpIHtcclxuICAgICAgZGF0YSA9IGlucHV0O1xyXG4gICAgfSBlbHNlIGlmIChpbnB1dCkge1xyXG4gICAgICBjaGVjayQxLnR5cGUoaW5wdXQsICdvYmplY3QnLCAnaW52YWxpZCBhcmd1bWVudHMgdG8gcmVnbC5yZWFkKCknKTtcclxuICAgICAgeCA9IGlucHV0LnggfCAwO1xyXG4gICAgICB5ID0gaW5wdXQueSB8IDA7XHJcbiAgICAgIGNoZWNrJDEoXHJcbiAgICAgICAgeCA+PSAwICYmIHggPCBjb250ZXh0LmZyYW1lYnVmZmVyV2lkdGgsXHJcbiAgICAgICAgJ2ludmFsaWQgeCBvZmZzZXQgZm9yIHJlZ2wucmVhZCcpO1xyXG4gICAgICBjaGVjayQxKFxyXG4gICAgICAgIHkgPj0gMCAmJiB5IDwgY29udGV4dC5mcmFtZWJ1ZmZlckhlaWdodCxcclxuICAgICAgICAnaW52YWxpZCB5IG9mZnNldCBmb3IgcmVnbC5yZWFkJyk7XHJcbiAgICAgIHdpZHRoID0gKGlucHV0LndpZHRoIHx8IChjb250ZXh0LmZyYW1lYnVmZmVyV2lkdGggLSB4KSkgfCAwO1xyXG4gICAgICBoZWlnaHQgPSAoaW5wdXQuaGVpZ2h0IHx8IChjb250ZXh0LmZyYW1lYnVmZmVySGVpZ2h0IC0geSkpIHwgMDtcclxuICAgICAgZGF0YSA9IGlucHV0LmRhdGEgfHwgbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICAvLyBzYW5pdHkgY2hlY2sgaW5wdXQuZGF0YVxyXG4gICAgaWYgKGRhdGEpIHtcclxuICAgICAgaWYgKHR5cGUgPT09IEdMX1VOU0lHTkVEX0JZVEUkNykge1xyXG4gICAgICAgIGNoZWNrJDEoXHJcbiAgICAgICAgICBkYXRhIGluc3RhbmNlb2YgVWludDhBcnJheSxcclxuICAgICAgICAgICdidWZmZXIgbXVzdCBiZSBcXCdVaW50OEFycmF5XFwnIHdoZW4gcmVhZGluZyBmcm9tIGEgZnJhbWVidWZmZXIgb2YgdHlwZSBcXCd1aW50OFxcJycpO1xyXG4gICAgICB9IGVsc2UgaWYgKHR5cGUgPT09IEdMX0ZMT0FUJDcpIHtcclxuICAgICAgICBjaGVjayQxKFxyXG4gICAgICAgICAgZGF0YSBpbnN0YW5jZW9mIEZsb2F0MzJBcnJheSxcclxuICAgICAgICAgICdidWZmZXIgbXVzdCBiZSBcXCdGbG9hdDMyQXJyYXlcXCcgd2hlbiByZWFkaW5nIGZyb20gYSBmcmFtZWJ1ZmZlciBvZiB0eXBlIFxcJ2Zsb2F0XFwnJyk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBjaGVjayQxKFxyXG4gICAgICB3aWR0aCA+IDAgJiYgd2lkdGggKyB4IDw9IGNvbnRleHQuZnJhbWVidWZmZXJXaWR0aCxcclxuICAgICAgJ2ludmFsaWQgd2lkdGggZm9yIHJlYWQgcGl4ZWxzJyk7XHJcbiAgICBjaGVjayQxKFxyXG4gICAgICBoZWlnaHQgPiAwICYmIGhlaWdodCArIHkgPD0gY29udGV4dC5mcmFtZWJ1ZmZlckhlaWdodCxcclxuICAgICAgJ2ludmFsaWQgaGVpZ2h0IGZvciByZWFkIHBpeGVscycpO1xyXG5cclxuICAgIC8vIFVwZGF0ZSBXZWJHTCBzdGF0ZVxyXG4gICAgcmVnbFBvbGwoKTtcclxuXHJcbiAgICAvLyBDb21wdXRlIHNpemVcclxuICAgIHZhciBzaXplID0gd2lkdGggKiBoZWlnaHQgKiA0O1xyXG5cclxuICAgIC8vIEFsbG9jYXRlIGRhdGFcclxuICAgIGlmICghZGF0YSkge1xyXG4gICAgICBpZiAodHlwZSA9PT0gR0xfVU5TSUdORURfQllURSQ3KSB7XHJcbiAgICAgICAgZGF0YSA9IG5ldyBVaW50OEFycmF5KHNpemUpO1xyXG4gICAgICB9IGVsc2UgaWYgKHR5cGUgPT09IEdMX0ZMT0FUJDcpIHtcclxuICAgICAgICBkYXRhID0gZGF0YSB8fCBuZXcgRmxvYXQzMkFycmF5KHNpemUpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gVHlwZSBjaGVja1xyXG4gICAgY2hlY2skMS5pc1R5cGVkQXJyYXkoZGF0YSwgJ2RhdGEgYnVmZmVyIGZvciByZWdsLnJlYWQoKSBtdXN0IGJlIGEgdHlwZWRhcnJheScpO1xyXG4gICAgY2hlY2skMShkYXRhLmJ5dGVMZW5ndGggPj0gc2l6ZSwgJ2RhdGEgYnVmZmVyIGZvciByZWdsLnJlYWQoKSB0b28gc21hbGwnKTtcclxuXHJcbiAgICAvLyBSdW4gcmVhZCBwaXhlbHNcclxuICAgIGdsLnBpeGVsU3RvcmVpKEdMX1BBQ0tfQUxJR05NRU5ULCA0KTtcclxuICAgIGdsLnJlYWRQaXhlbHMoeCwgeSwgd2lkdGgsIGhlaWdodCwgR0xfUkdCQSQzLFxyXG4gICAgICAgICAgICAgICAgICB0eXBlLFxyXG4gICAgICAgICAgICAgICAgICBkYXRhKTtcclxuXHJcbiAgICByZXR1cm4gZGF0YVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gcmVhZFBpeGVsc0ZCTyAob3B0aW9ucykge1xyXG4gICAgdmFyIHJlc3VsdDtcclxuICAgIGZyYW1lYnVmZmVyU3RhdGUuc2V0RkJPKHtcclxuICAgICAgZnJhbWVidWZmZXI6IG9wdGlvbnMuZnJhbWVidWZmZXJcclxuICAgIH0sIGZ1bmN0aW9uICgpIHtcclxuICAgICAgcmVzdWx0ID0gcmVhZFBpeGVsc0ltcGwob3B0aW9ucyk7XHJcbiAgICB9KTtcclxuICAgIHJldHVybiByZXN1bHRcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHJlYWRQaXhlbHMgKG9wdGlvbnMpIHtcclxuICAgIGlmICghb3B0aW9ucyB8fCAhKCdmcmFtZWJ1ZmZlcicgaW4gb3B0aW9ucykpIHtcclxuICAgICAgcmV0dXJuIHJlYWRQaXhlbHNJbXBsKG9wdGlvbnMpXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICByZXR1cm4gcmVhZFBpeGVsc0ZCTyhvcHRpb25zKVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHJlYWRQaXhlbHNcclxufVxuXG5mdW5jdGlvbiBzbGljZSAoeCkge1xyXG4gIHJldHVybiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh4KVxyXG59XHJcblxyXG5mdW5jdGlvbiBqb2luICh4KSB7XHJcbiAgcmV0dXJuIHNsaWNlKHgpLmpvaW4oJycpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZUVudmlyb25tZW50ICgpIHtcclxuICAvLyBVbmlxdWUgdmFyaWFibGUgaWQgY291bnRlclxyXG4gIHZhciB2YXJDb3VudGVyID0gMDtcclxuXHJcbiAgLy8gTGlua2VkIHZhbHVlcyBhcmUgcGFzc2VkIGZyb20gdGhpcyBzY29wZSBpbnRvIHRoZSBnZW5lcmF0ZWQgY29kZSBibG9ja1xyXG4gIC8vIENhbGxpbmcgbGluaygpIHBhc3NlcyBhIHZhbHVlIGludG8gdGhlIGdlbmVyYXRlZCBzY29wZSBhbmQgcmV0dXJuc1xyXG4gIC8vIHRoZSB2YXJpYWJsZSBuYW1lIHdoaWNoIGl0IGlzIGJvdW5kIHRvXHJcbiAgdmFyIGxpbmtlZE5hbWVzID0gW107XHJcbiAgdmFyIGxpbmtlZFZhbHVlcyA9IFtdO1xyXG4gIGZ1bmN0aW9uIGxpbmsgKHZhbHVlKSB7XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxpbmtlZFZhbHVlcy5sZW5ndGg7ICsraSkge1xyXG4gICAgICBpZiAobGlua2VkVmFsdWVzW2ldID09PSB2YWx1ZSkge1xyXG4gICAgICAgIHJldHVybiBsaW5rZWROYW1lc1tpXVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIG5hbWUgPSAnZycgKyAodmFyQ291bnRlcisrKTtcclxuICAgIGxpbmtlZE5hbWVzLnB1c2gobmFtZSk7XHJcbiAgICBsaW5rZWRWYWx1ZXMucHVzaCh2YWx1ZSk7XHJcbiAgICByZXR1cm4gbmFtZVxyXG4gIH1cclxuXHJcbiAgLy8gY3JlYXRlIGEgY29kZSBibG9ja1xyXG4gIGZ1bmN0aW9uIGJsb2NrICgpIHtcclxuICAgIHZhciBjb2RlID0gW107XHJcbiAgICBmdW5jdGlvbiBwdXNoICgpIHtcclxuICAgICAgY29kZS5wdXNoLmFwcGx5KGNvZGUsIHNsaWNlKGFyZ3VtZW50cykpO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciB2YXJzID0gW107XHJcbiAgICBmdW5jdGlvbiBkZWYgKCkge1xyXG4gICAgICB2YXIgbmFtZSA9ICd2JyArICh2YXJDb3VudGVyKyspO1xyXG4gICAgICB2YXJzLnB1c2gobmFtZSk7XHJcblxyXG4gICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICBjb2RlLnB1c2gobmFtZSwgJz0nKTtcclxuICAgICAgICBjb2RlLnB1c2guYXBwbHkoY29kZSwgc2xpY2UoYXJndW1lbnRzKSk7XHJcbiAgICAgICAgY29kZS5wdXNoKCc7Jyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiBuYW1lXHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGV4dGVuZChwdXNoLCB7XHJcbiAgICAgIGRlZjogZGVmLFxyXG4gICAgICB0b1N0cmluZzogZnVuY3Rpb24gKCkge1xyXG4gICAgICAgIHJldHVybiBqb2luKFtcclxuICAgICAgICAgICh2YXJzLmxlbmd0aCA+IDAgPyAndmFyICcgKyB2YXJzICsgJzsnIDogJycpLFxyXG4gICAgICAgICAgam9pbihjb2RlKVxyXG4gICAgICAgIF0pXHJcbiAgICAgIH1cclxuICAgIH0pXHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBzY29wZSAoKSB7XHJcbiAgICB2YXIgZW50cnkgPSBibG9jaygpO1xyXG4gICAgdmFyIGV4aXQgPSBibG9jaygpO1xyXG5cclxuICAgIHZhciBlbnRyeVRvU3RyaW5nID0gZW50cnkudG9TdHJpbmc7XHJcbiAgICB2YXIgZXhpdFRvU3RyaW5nID0gZXhpdC50b1N0cmluZztcclxuXHJcbiAgICBmdW5jdGlvbiBzYXZlIChvYmplY3QsIHByb3ApIHtcclxuICAgICAgZXhpdChvYmplY3QsIHByb3AsICc9JywgZW50cnkuZGVmKG9iamVjdCwgcHJvcCksICc7Jyk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGV4dGVuZChmdW5jdGlvbiAoKSB7XHJcbiAgICAgIGVudHJ5LmFwcGx5KGVudHJ5LCBzbGljZShhcmd1bWVudHMpKTtcclxuICAgIH0sIHtcclxuICAgICAgZGVmOiBlbnRyeS5kZWYsXHJcbiAgICAgIGVudHJ5OiBlbnRyeSxcclxuICAgICAgZXhpdDogZXhpdCxcclxuICAgICAgc2F2ZTogc2F2ZSxcclxuICAgICAgc2V0OiBmdW5jdGlvbiAob2JqZWN0LCBwcm9wLCB2YWx1ZSkge1xyXG4gICAgICAgIHNhdmUob2JqZWN0LCBwcm9wKTtcclxuICAgICAgICBlbnRyeShvYmplY3QsIHByb3AsICc9JywgdmFsdWUsICc7Jyk7XHJcbiAgICAgIH0sXHJcbiAgICAgIHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgcmV0dXJuIGVudHJ5VG9TdHJpbmcoKSArIGV4aXRUb1N0cmluZygpXHJcbiAgICAgIH1cclxuICAgIH0pXHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBjb25kaXRpb25hbCAoKSB7XHJcbiAgICB2YXIgcHJlZCA9IGpvaW4oYXJndW1lbnRzKTtcclxuICAgIHZhciB0aGVuQmxvY2sgPSBzY29wZSgpO1xyXG4gICAgdmFyIGVsc2VCbG9jayA9IHNjb3BlKCk7XHJcblxyXG4gICAgdmFyIHRoZW5Ub1N0cmluZyA9IHRoZW5CbG9jay50b1N0cmluZztcclxuICAgIHZhciBlbHNlVG9TdHJpbmcgPSBlbHNlQmxvY2sudG9TdHJpbmc7XHJcblxyXG4gICAgcmV0dXJuIGV4dGVuZCh0aGVuQmxvY2ssIHtcclxuICAgICAgdGhlbjogZnVuY3Rpb24gKCkge1xyXG4gICAgICAgIHRoZW5CbG9jay5hcHBseSh0aGVuQmxvY2ssIHNsaWNlKGFyZ3VtZW50cykpO1xyXG4gICAgICAgIHJldHVybiB0aGlzXHJcbiAgICAgIH0sXHJcbiAgICAgIGVsc2U6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICBlbHNlQmxvY2suYXBwbHkoZWxzZUJsb2NrLCBzbGljZShhcmd1bWVudHMpKTtcclxuICAgICAgICByZXR1cm4gdGhpc1xyXG4gICAgICB9LFxyXG4gICAgICB0b1N0cmluZzogZnVuY3Rpb24gKCkge1xyXG4gICAgICAgIHZhciBlbHNlQ2xhdXNlID0gZWxzZVRvU3RyaW5nKCk7XHJcbiAgICAgICAgaWYgKGVsc2VDbGF1c2UpIHtcclxuICAgICAgICAgIGVsc2VDbGF1c2UgPSAnZWxzZXsnICsgZWxzZUNsYXVzZSArICd9JztcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGpvaW4oW1xyXG4gICAgICAgICAgJ2lmKCcsIHByZWQsICcpeycsXHJcbiAgICAgICAgICB0aGVuVG9TdHJpbmcoKSxcclxuICAgICAgICAgICd9JywgZWxzZUNsYXVzZVxyXG4gICAgICAgIF0pXHJcbiAgICAgIH1cclxuICAgIH0pXHJcbiAgfVxyXG5cclxuICAvLyBwcm9jZWR1cmUgbGlzdFxyXG4gIHZhciBnbG9iYWxCbG9jayA9IGJsb2NrKCk7XHJcbiAgdmFyIHByb2NlZHVyZXMgPSB7fTtcclxuICBmdW5jdGlvbiBwcm9jIChuYW1lLCBjb3VudCkge1xyXG4gICAgdmFyIGFyZ3MgPSBbXTtcclxuICAgIGZ1bmN0aW9uIGFyZyAoKSB7XHJcbiAgICAgIHZhciBuYW1lID0gJ2EnICsgYXJncy5sZW5ndGg7XHJcbiAgICAgIGFyZ3MucHVzaChuYW1lKTtcclxuICAgICAgcmV0dXJuIG5hbWVcclxuICAgIH1cclxuXHJcbiAgICBjb3VudCA9IGNvdW50IHx8IDA7XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNvdW50OyArK2kpIHtcclxuICAgICAgYXJnKCk7XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIGJvZHkgPSBzY29wZSgpO1xyXG4gICAgdmFyIGJvZHlUb1N0cmluZyA9IGJvZHkudG9TdHJpbmc7XHJcblxyXG4gICAgdmFyIHJlc3VsdCA9IHByb2NlZHVyZXNbbmFtZV0gPSBleHRlbmQoYm9keSwge1xyXG4gICAgICBhcmc6IGFyZyxcclxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICByZXR1cm4gam9pbihbXHJcbiAgICAgICAgICAnZnVuY3Rpb24oJywgYXJncy5qb2luKCksICcpeycsXHJcbiAgICAgICAgICBib2R5VG9TdHJpbmcoKSxcclxuICAgICAgICAgICd9J1xyXG4gICAgICAgIF0pXHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIHJldHVybiByZXN1bHRcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGNvbXBpbGUgKCkge1xyXG4gICAgdmFyIGNvZGUgPSBbJ1widXNlIHN0cmljdFwiOycsXHJcbiAgICAgIGdsb2JhbEJsb2NrLFxyXG4gICAgICAncmV0dXJuIHsnXTtcclxuICAgIE9iamVjdC5rZXlzKHByb2NlZHVyZXMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcclxuICAgICAgY29kZS5wdXNoKCdcIicsIG5hbWUsICdcIjonLCBwcm9jZWR1cmVzW25hbWVdLnRvU3RyaW5nKCksICcsJyk7XHJcbiAgICB9KTtcclxuICAgIGNvZGUucHVzaCgnfScpO1xyXG4gICAgdmFyIHNyYyA9IGpvaW4oY29kZSlcclxuICAgICAgLnJlcGxhY2UoLzsvZywgJztcXG4nKVxyXG4gICAgICAucmVwbGFjZSgvfS9nLCAnfVxcbicpXHJcbiAgICAgIC5yZXBsYWNlKC97L2csICd7XFxuJyk7XHJcbiAgICB2YXIgcHJvYyA9IEZ1bmN0aW9uLmFwcGx5KG51bGwsIGxpbmtlZE5hbWVzLmNvbmNhdChzcmMpKTtcclxuICAgIHJldHVybiBwcm9jLmFwcGx5KG51bGwsIGxpbmtlZFZhbHVlcylcclxuICB9XHJcblxyXG4gIHJldHVybiB7XHJcbiAgICBnbG9iYWw6IGdsb2JhbEJsb2NrLFxyXG4gICAgbGluazogbGluayxcclxuICAgIGJsb2NrOiBibG9jayxcclxuICAgIHByb2M6IHByb2MsXHJcbiAgICBzY29wZTogc2NvcGUsXHJcbiAgICBjb25kOiBjb25kaXRpb25hbCxcclxuICAgIGNvbXBpbGU6IGNvbXBpbGVcclxuICB9XHJcbn1cblxuLy8gXCJjdXRlXCIgbmFtZXMgZm9yIHZlY3RvciBjb21wb25lbnRzXHJcbnZhciBDVVRFX0NPTVBPTkVOVFMgPSAneHl6dycuc3BsaXQoJycpO1xyXG5cclxudmFyIEdMX1VOU0lHTkVEX0JZVEUkOCA9IDUxMjE7XHJcblxyXG52YXIgQVRUUklCX1NUQVRFX1BPSU5URVIgPSAxO1xyXG52YXIgQVRUUklCX1NUQVRFX0NPTlNUQU5UID0gMjtcclxuXHJcbnZhciBEWU5fRlVOQyQxID0gMDtcclxudmFyIERZTl9QUk9QJDEgPSAxO1xyXG52YXIgRFlOX0NPTlRFWFQkMSA9IDI7XHJcbnZhciBEWU5fU1RBVEUkMSA9IDM7XHJcbnZhciBEWU5fVEhVTksgPSA0O1xyXG5cclxudmFyIFNfRElUSEVSID0gJ2RpdGhlcic7XHJcbnZhciBTX0JMRU5EX0VOQUJMRSA9ICdibGVuZC5lbmFibGUnO1xyXG52YXIgU19CTEVORF9DT0xPUiA9ICdibGVuZC5jb2xvcic7XHJcbnZhciBTX0JMRU5EX0VRVUFUSU9OID0gJ2JsZW5kLmVxdWF0aW9uJztcclxudmFyIFNfQkxFTkRfRlVOQyA9ICdibGVuZC5mdW5jJztcclxudmFyIFNfREVQVEhfRU5BQkxFID0gJ2RlcHRoLmVuYWJsZSc7XHJcbnZhciBTX0RFUFRIX0ZVTkMgPSAnZGVwdGguZnVuYyc7XHJcbnZhciBTX0RFUFRIX1JBTkdFID0gJ2RlcHRoLnJhbmdlJztcclxudmFyIFNfREVQVEhfTUFTSyA9ICdkZXB0aC5tYXNrJztcclxudmFyIFNfQ09MT1JfTUFTSyA9ICdjb2xvck1hc2snO1xyXG52YXIgU19DVUxMX0VOQUJMRSA9ICdjdWxsLmVuYWJsZSc7XHJcbnZhciBTX0NVTExfRkFDRSA9ICdjdWxsLmZhY2UnO1xyXG52YXIgU19GUk9OVF9GQUNFID0gJ2Zyb250RmFjZSc7XHJcbnZhciBTX0xJTkVfV0lEVEggPSAnbGluZVdpZHRoJztcclxudmFyIFNfUE9MWUdPTl9PRkZTRVRfRU5BQkxFID0gJ3BvbHlnb25PZmZzZXQuZW5hYmxlJztcclxudmFyIFNfUE9MWUdPTl9PRkZTRVRfT0ZGU0VUID0gJ3BvbHlnb25PZmZzZXQub2Zmc2V0JztcclxudmFyIFNfU0FNUExFX0FMUEhBID0gJ3NhbXBsZS5hbHBoYSc7XHJcbnZhciBTX1NBTVBMRV9FTkFCTEUgPSAnc2FtcGxlLmVuYWJsZSc7XHJcbnZhciBTX1NBTVBMRV9DT1ZFUkFHRSA9ICdzYW1wbGUuY292ZXJhZ2UnO1xyXG52YXIgU19TVEVOQ0lMX0VOQUJMRSA9ICdzdGVuY2lsLmVuYWJsZSc7XHJcbnZhciBTX1NURU5DSUxfTUFTSyA9ICdzdGVuY2lsLm1hc2snO1xyXG52YXIgU19TVEVOQ0lMX0ZVTkMgPSAnc3RlbmNpbC5mdW5jJztcclxudmFyIFNfU1RFTkNJTF9PUEZST05UID0gJ3N0ZW5jaWwub3BGcm9udCc7XHJcbnZhciBTX1NURU5DSUxfT1BCQUNLID0gJ3N0ZW5jaWwub3BCYWNrJztcclxudmFyIFNfU0NJU1NPUl9FTkFCTEUgPSAnc2Npc3Nvci5lbmFibGUnO1xyXG52YXIgU19TQ0lTU09SX0JPWCA9ICdzY2lzc29yLmJveCc7XHJcbnZhciBTX1ZJRVdQT1JUID0gJ3ZpZXdwb3J0JztcclxuXHJcbnZhciBTX1BST0ZJTEUgPSAncHJvZmlsZSc7XHJcblxyXG52YXIgU19GUkFNRUJVRkZFUiA9ICdmcmFtZWJ1ZmZlcic7XHJcbnZhciBTX1ZFUlQgPSAndmVydCc7XHJcbnZhciBTX0ZSQUcgPSAnZnJhZyc7XHJcbnZhciBTX0VMRU1FTlRTID0gJ2VsZW1lbnRzJztcclxudmFyIFNfUFJJTUlUSVZFID0gJ3ByaW1pdGl2ZSc7XHJcbnZhciBTX0NPVU5UID0gJ2NvdW50JztcclxudmFyIFNfT0ZGU0VUID0gJ29mZnNldCc7XHJcbnZhciBTX0lOU1RBTkNFUyA9ICdpbnN0YW5jZXMnO1xyXG5cclxudmFyIFNVRkZJWF9XSURUSCA9ICdXaWR0aCc7XHJcbnZhciBTVUZGSVhfSEVJR0hUID0gJ0hlaWdodCc7XHJcblxyXG52YXIgU19GUkFNRUJVRkZFUl9XSURUSCA9IFNfRlJBTUVCVUZGRVIgKyBTVUZGSVhfV0lEVEg7XHJcbnZhciBTX0ZSQU1FQlVGRkVSX0hFSUdIVCA9IFNfRlJBTUVCVUZGRVIgKyBTVUZGSVhfSEVJR0hUO1xyXG52YXIgU19WSUVXUE9SVF9XSURUSCA9IFNfVklFV1BPUlQgKyBTVUZGSVhfV0lEVEg7XHJcbnZhciBTX1ZJRVdQT1JUX0hFSUdIVCA9IFNfVklFV1BPUlQgKyBTVUZGSVhfSEVJR0hUO1xyXG52YXIgU19EUkFXSU5HQlVGRkVSID0gJ2RyYXdpbmdCdWZmZXInO1xyXG52YXIgU19EUkFXSU5HQlVGRkVSX1dJRFRIID0gU19EUkFXSU5HQlVGRkVSICsgU1VGRklYX1dJRFRIO1xyXG52YXIgU19EUkFXSU5HQlVGRkVSX0hFSUdIVCA9IFNfRFJBV0lOR0JVRkZFUiArIFNVRkZJWF9IRUlHSFQ7XHJcblxyXG52YXIgTkVTVEVEX09QVElPTlMgPSBbXHJcbiAgU19CTEVORF9GVU5DLFxyXG4gIFNfQkxFTkRfRVFVQVRJT04sXHJcbiAgU19TVEVOQ0lMX0ZVTkMsXHJcbiAgU19TVEVOQ0lMX09QRlJPTlQsXHJcbiAgU19TVEVOQ0lMX09QQkFDSyxcclxuICBTX1NBTVBMRV9DT1ZFUkFHRSxcclxuICBTX1ZJRVdQT1JULFxyXG4gIFNfU0NJU1NPUl9CT1gsXHJcbiAgU19QT0xZR09OX09GRlNFVF9PRkZTRVRcclxuXTtcclxuXHJcbnZhciBHTF9BUlJBWV9CVUZGRVIkMSA9IDM0OTYyO1xyXG52YXIgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIkMSA9IDM0OTYzO1xyXG5cclxudmFyIEdMX0ZSQUdNRU5UX1NIQURFUiQxID0gMzU2MzI7XHJcbnZhciBHTF9WRVJURVhfU0hBREVSJDEgPSAzNTYzMztcclxuXHJcbnZhciBHTF9URVhUVVJFXzJEJDMgPSAweDBERTE7XHJcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQJDIgPSAweDg1MTM7XHJcblxyXG52YXIgR0xfQ1VMTF9GQUNFID0gMHgwQjQ0O1xyXG52YXIgR0xfQkxFTkQgPSAweDBCRTI7XHJcbnZhciBHTF9ESVRIRVIgPSAweDBCRDA7XHJcbnZhciBHTF9TVEVOQ0lMX1RFU1QgPSAweDBCOTA7XHJcbnZhciBHTF9ERVBUSF9URVNUID0gMHgwQjcxO1xyXG52YXIgR0xfU0NJU1NPUl9URVNUID0gMHgwQzExO1xyXG52YXIgR0xfUE9MWUdPTl9PRkZTRVRfRklMTCA9IDB4ODAzNztcclxudmFyIEdMX1NBTVBMRV9BTFBIQV9UT19DT1ZFUkFHRSA9IDB4ODA5RTtcclxudmFyIEdMX1NBTVBMRV9DT1ZFUkFHRSA9IDB4ODBBMDtcclxuXHJcbnZhciBHTF9GTE9BVCQ4ID0gNTEyNjtcclxudmFyIEdMX0ZMT0FUX1ZFQzIgPSAzNTY2NDtcclxudmFyIEdMX0ZMT0FUX1ZFQzMgPSAzNTY2NTtcclxudmFyIEdMX0ZMT0FUX1ZFQzQgPSAzNTY2NjtcclxudmFyIEdMX0lOVCQzID0gNTEyNDtcclxudmFyIEdMX0lOVF9WRUMyID0gMzU2Njc7XHJcbnZhciBHTF9JTlRfVkVDMyA9IDM1NjY4O1xyXG52YXIgR0xfSU5UX1ZFQzQgPSAzNTY2OTtcclxudmFyIEdMX0JPT0wgPSAzNTY3MDtcclxudmFyIEdMX0JPT0xfVkVDMiA9IDM1NjcxO1xyXG52YXIgR0xfQk9PTF9WRUMzID0gMzU2NzI7XHJcbnZhciBHTF9CT09MX1ZFQzQgPSAzNTY3MztcclxudmFyIEdMX0ZMT0FUX01BVDIgPSAzNTY3NDtcclxudmFyIEdMX0ZMT0FUX01BVDMgPSAzNTY3NTtcclxudmFyIEdMX0ZMT0FUX01BVDQgPSAzNTY3NjtcclxudmFyIEdMX1NBTVBMRVJfMkQgPSAzNTY3ODtcclxudmFyIEdMX1NBTVBMRVJfQ1VCRSA9IDM1NjgwO1xyXG5cclxudmFyIEdMX1RSSUFOR0xFUyQxID0gNDtcclxuXHJcbnZhciBHTF9GUk9OVCA9IDEwMjg7XHJcbnZhciBHTF9CQUNLID0gMTAyOTtcclxudmFyIEdMX0NXID0gMHgwOTAwO1xyXG52YXIgR0xfQ0NXID0gMHgwOTAxO1xyXG52YXIgR0xfTUlOX0VYVCA9IDB4ODAwNztcclxudmFyIEdMX01BWF9FWFQgPSAweDgwMDg7XHJcbnZhciBHTF9BTFdBWVMgPSA1MTk7XHJcbnZhciBHTF9LRUVQID0gNzY4MDtcclxudmFyIEdMX1pFUk8gPSAwO1xyXG52YXIgR0xfT05FID0gMTtcclxudmFyIEdMX0ZVTkNfQUREID0gMHg4MDA2O1xyXG52YXIgR0xfTEVTUyA9IDUxMztcclxuXHJcbnZhciBHTF9GUkFNRUJVRkZFUiQyID0gMHg4RDQwO1xyXG52YXIgR0xfQ09MT1JfQVRUQUNITUVOVDAkMiA9IDB4OENFMDtcclxuXHJcbnZhciBibGVuZEZ1bmNzID0ge1xyXG4gICcwJzogMCxcclxuICAnMSc6IDEsXHJcbiAgJ3plcm8nOiAwLFxyXG4gICdvbmUnOiAxLFxyXG4gICdzcmMgY29sb3InOiA3NjgsXHJcbiAgJ29uZSBtaW51cyBzcmMgY29sb3InOiA3NjksXHJcbiAgJ3NyYyBhbHBoYSc6IDc3MCxcclxuICAnb25lIG1pbnVzIHNyYyBhbHBoYSc6IDc3MSxcclxuICAnZHN0IGNvbG9yJzogNzc0LFxyXG4gICdvbmUgbWludXMgZHN0IGNvbG9yJzogNzc1LFxyXG4gICdkc3QgYWxwaGEnOiA3NzIsXHJcbiAgJ29uZSBtaW51cyBkc3QgYWxwaGEnOiA3NzMsXHJcbiAgJ2NvbnN0YW50IGNvbG9yJzogMzI3NjksXHJcbiAgJ29uZSBtaW51cyBjb25zdGFudCBjb2xvcic6IDMyNzcwLFxyXG4gICdjb25zdGFudCBhbHBoYSc6IDMyNzcxLFxyXG4gICdvbmUgbWludXMgY29uc3RhbnQgYWxwaGEnOiAzMjc3MixcclxuICAnc3JjIGFscGhhIHNhdHVyYXRlJzogNzc2XHJcbn07XHJcblxyXG4vLyBUaGVyZSBhcmUgaW52YWxpZCB2YWx1ZXMgZm9yIHNyY1JHQiBhbmQgZHN0UkdCLiBTZWU6XHJcbi8vIGh0dHBzOi8vd3d3Lmtocm9ub3Mub3JnL3JlZ2lzdHJ5L3dlYmdsL3NwZWNzLzEuMC8jNi4xM1xyXG4vLyBodHRwczovL2dpdGh1Yi5jb20vS2hyb25vc0dyb3VwL1dlYkdML2Jsb2IvMGQzMjAxZjVmN2VjM2MwMDYwYmMxZjA0MDc3NDYxNTQxZjE5ODdiOS9jb25mb3JtYW5jZS1zdWl0ZXMvMS4wLjMvY29uZm9ybWFuY2UvbWlzYy93ZWJnbC1zcGVjaWZpYy5odG1sI0w1NlxyXG52YXIgaW52YWxpZEJsZW5kQ29tYmluYXRpb25zID0gW1xyXG4gICdjb25zdGFudCBjb2xvciwgY29uc3RhbnQgYWxwaGEnLFxyXG4gICdvbmUgbWludXMgY29uc3RhbnQgY29sb3IsIGNvbnN0YW50IGFscGhhJyxcclxuICAnY29uc3RhbnQgY29sb3IsIG9uZSBtaW51cyBjb25zdGFudCBhbHBoYScsXHJcbiAgJ29uZSBtaW51cyBjb25zdGFudCBjb2xvciwgb25lIG1pbnVzIGNvbnN0YW50IGFscGhhJyxcclxuICAnY29uc3RhbnQgYWxwaGEsIGNvbnN0YW50IGNvbG9yJyxcclxuICAnY29uc3RhbnQgYWxwaGEsIG9uZSBtaW51cyBjb25zdGFudCBjb2xvcicsXHJcbiAgJ29uZSBtaW51cyBjb25zdGFudCBhbHBoYSwgY29uc3RhbnQgY29sb3InLFxyXG4gICdvbmUgbWludXMgY29uc3RhbnQgYWxwaGEsIG9uZSBtaW51cyBjb25zdGFudCBjb2xvcidcclxuXTtcclxuXHJcbnZhciBjb21wYXJlRnVuY3MgPSB7XHJcbiAgJ25ldmVyJzogNTEyLFxyXG4gICdsZXNzJzogNTEzLFxyXG4gICc8JzogNTEzLFxyXG4gICdlcXVhbCc6IDUxNCxcclxuICAnPSc6IDUxNCxcclxuICAnPT0nOiA1MTQsXHJcbiAgJz09PSc6IDUxNCxcclxuICAnbGVxdWFsJzogNTE1LFxyXG4gICc8PSc6IDUxNSxcclxuICAnZ3JlYXRlcic6IDUxNixcclxuICAnPic6IDUxNixcclxuICAnbm90ZXF1YWwnOiA1MTcsXHJcbiAgJyE9JzogNTE3LFxyXG4gICchPT0nOiA1MTcsXHJcbiAgJ2dlcXVhbCc6IDUxOCxcclxuICAnPj0nOiA1MTgsXHJcbiAgJ2Fsd2F5cyc6IDUxOVxyXG59O1xyXG5cclxudmFyIHN0ZW5jaWxPcHMgPSB7XHJcbiAgJzAnOiAwLFxyXG4gICd6ZXJvJzogMCxcclxuICAna2VlcCc6IDc2ODAsXHJcbiAgJ3JlcGxhY2UnOiA3NjgxLFxyXG4gICdpbmNyZW1lbnQnOiA3NjgyLFxyXG4gICdkZWNyZW1lbnQnOiA3NjgzLFxyXG4gICdpbmNyZW1lbnQgd3JhcCc6IDM0MDU1LFxyXG4gICdkZWNyZW1lbnQgd3JhcCc6IDM0MDU2LFxyXG4gICdpbnZlcnQnOiA1Mzg2XHJcbn07XHJcblxyXG52YXIgc2hhZGVyVHlwZSA9IHtcclxuICAnZnJhZyc6IEdMX0ZSQUdNRU5UX1NIQURFUiQxLFxyXG4gICd2ZXJ0JzogR0xfVkVSVEVYX1NIQURFUiQxXHJcbn07XHJcblxyXG52YXIgb3JpZW50YXRpb25UeXBlID0ge1xyXG4gICdjdyc6IEdMX0NXLFxyXG4gICdjY3cnOiBHTF9DQ1dcclxufTtcclxuXHJcbmZ1bmN0aW9uIGlzQnVmZmVyQXJncyAoeCkge1xyXG4gIHJldHVybiBBcnJheS5pc0FycmF5KHgpIHx8XHJcbiAgICBpc1R5cGVkQXJyYXkoeCkgfHxcclxuICAgIGlzTkRBcnJheUxpa2UoeClcclxufVxyXG5cclxuLy8gTWFrZSBzdXJlIHZpZXdwb3J0IGlzIHByb2Nlc3NlZCBmaXJzdFxyXG5mdW5jdGlvbiBzb3J0U3RhdGUgKHN0YXRlKSB7XHJcbiAgcmV0dXJuIHN0YXRlLnNvcnQoZnVuY3Rpb24gKGEsIGIpIHtcclxuICAgIGlmIChhID09PSBTX1ZJRVdQT1JUKSB7XHJcbiAgICAgIHJldHVybiAtMVxyXG4gICAgfSBlbHNlIGlmIChiID09PSBTX1ZJRVdQT1JUKSB7XHJcbiAgICAgIHJldHVybiAxXHJcbiAgICB9XHJcbiAgICByZXR1cm4gKGEgPCBiKSA/IC0xIDogMVxyXG4gIH0pXHJcbn1cclxuXHJcbmZ1bmN0aW9uIERlY2xhcmF0aW9uICh0aGlzRGVwLCBjb250ZXh0RGVwLCBwcm9wRGVwLCBhcHBlbmQpIHtcclxuICB0aGlzLnRoaXNEZXAgPSB0aGlzRGVwO1xyXG4gIHRoaXMuY29udGV4dERlcCA9IGNvbnRleHREZXA7XHJcbiAgdGhpcy5wcm9wRGVwID0gcHJvcERlcDtcclxuICB0aGlzLmFwcGVuZCA9IGFwcGVuZDtcclxufVxyXG5cclxuZnVuY3Rpb24gaXNTdGF0aWMgKGRlY2wpIHtcclxuICByZXR1cm4gZGVjbCAmJiAhKGRlY2wudGhpc0RlcCB8fCBkZWNsLmNvbnRleHREZXAgfHwgZGVjbC5wcm9wRGVwKVxyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVTdGF0aWNEZWNsIChhcHBlbmQpIHtcclxuICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKGZhbHNlLCBmYWxzZSwgZmFsc2UsIGFwcGVuZClcclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlRHluYW1pY0RlY2wgKGR5biwgYXBwZW5kKSB7XHJcbiAgdmFyIHR5cGUgPSBkeW4udHlwZTtcclxuICBpZiAodHlwZSA9PT0gRFlOX0ZVTkMkMSkge1xyXG4gICAgdmFyIG51bUFyZ3MgPSBkeW4uZGF0YS5sZW5ndGg7XHJcbiAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxyXG4gICAgICB0cnVlLFxyXG4gICAgICBudW1BcmdzID49IDEsXHJcbiAgICAgIG51bUFyZ3MgPj0gMixcclxuICAgICAgYXBwZW5kKVxyXG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gRFlOX1RIVU5LKSB7XHJcbiAgICB2YXIgZGF0YSA9IGR5bi5kYXRhO1xyXG4gICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcclxuICAgICAgZGF0YS50aGlzRGVwLFxyXG4gICAgICBkYXRhLmNvbnRleHREZXAsXHJcbiAgICAgIGRhdGEucHJvcERlcCxcclxuICAgICAgYXBwZW5kKVxyXG4gIH0gZWxzZSB7XHJcbiAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxyXG4gICAgICB0eXBlID09PSBEWU5fU1RBVEUkMSxcclxuICAgICAgdHlwZSA9PT0gRFlOX0NPTlRFWFQkMSxcclxuICAgICAgdHlwZSA9PT0gRFlOX1BST1AkMSxcclxuICAgICAgYXBwZW5kKVxyXG4gIH1cclxufVxyXG5cclxudmFyIFNDT1BFX0RFQ0wgPSBuZXcgRGVjbGFyYXRpb24oZmFsc2UsIGZhbHNlLCBmYWxzZSwgZnVuY3Rpb24gKCkge30pO1xyXG5cclxuZnVuY3Rpb24gcmVnbENvcmUgKFxyXG4gIGdsLFxyXG4gIHN0cmluZ1N0b3JlLFxyXG4gIGV4dGVuc2lvbnMsXHJcbiAgbGltaXRzLFxyXG4gIGJ1ZmZlclN0YXRlLFxyXG4gIGVsZW1lbnRTdGF0ZSxcclxuICB0ZXh0dXJlU3RhdGUsXHJcbiAgZnJhbWVidWZmZXJTdGF0ZSxcclxuICB1bmlmb3JtU3RhdGUsXHJcbiAgYXR0cmlidXRlU3RhdGUsXHJcbiAgc2hhZGVyU3RhdGUsXHJcbiAgZHJhd1N0YXRlLFxyXG4gIGNvbnRleHRTdGF0ZSxcclxuICB0aW1lcixcclxuICBjb25maWcpIHtcclxuICB2YXIgQXR0cmlidXRlUmVjb3JkID0gYXR0cmlidXRlU3RhdGUuUmVjb3JkO1xyXG5cclxuICB2YXIgYmxlbmRFcXVhdGlvbnMgPSB7XHJcbiAgICAnYWRkJzogMzI3NzQsXHJcbiAgICAnc3VidHJhY3QnOiAzMjc3OCxcclxuICAgICdyZXZlcnNlIHN1YnRyYWN0JzogMzI3NzlcclxuICB9O1xyXG4gIGlmIChleHRlbnNpb25zLmV4dF9ibGVuZF9taW5tYXgpIHtcclxuICAgIGJsZW5kRXF1YXRpb25zLm1pbiA9IEdMX01JTl9FWFQ7XHJcbiAgICBibGVuZEVxdWF0aW9ucy5tYXggPSBHTF9NQVhfRVhUO1xyXG4gIH1cclxuXHJcbiAgdmFyIGV4dEluc3RhbmNpbmcgPSBleHRlbnNpb25zLmFuZ2xlX2luc3RhbmNlZF9hcnJheXM7XHJcbiAgdmFyIGV4dERyYXdCdWZmZXJzID0gZXh0ZW5zaW9ucy53ZWJnbF9kcmF3X2J1ZmZlcnM7XHJcblxyXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gIC8vIFdFQkdMIFNUQVRFXHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgdmFyIGN1cnJlbnRTdGF0ZSA9IHtcclxuICAgIGRpcnR5OiB0cnVlLFxyXG4gICAgcHJvZmlsZTogY29uZmlnLnByb2ZpbGVcclxuICB9O1xyXG4gIHZhciBuZXh0U3RhdGUgPSB7fTtcclxuICB2YXIgR0xfU1RBVEVfTkFNRVMgPSBbXTtcclxuICB2YXIgR0xfRkxBR1MgPSB7fTtcclxuICB2YXIgR0xfVkFSSUFCTEVTID0ge307XHJcblxyXG4gIGZ1bmN0aW9uIHByb3BOYW1lIChuYW1lKSB7XHJcbiAgICByZXR1cm4gbmFtZS5yZXBsYWNlKCcuJywgJ18nKVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gc3RhdGVGbGFnIChzbmFtZSwgY2FwLCBpbml0KSB7XHJcbiAgICB2YXIgbmFtZSA9IHByb3BOYW1lKHNuYW1lKTtcclxuICAgIEdMX1NUQVRFX05BTUVTLnB1c2goc25hbWUpO1xyXG4gICAgbmV4dFN0YXRlW25hbWVdID0gY3VycmVudFN0YXRlW25hbWVdID0gISFpbml0O1xyXG4gICAgR0xfRkxBR1NbbmFtZV0gPSBjYXA7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBzdGF0ZVZhcmlhYmxlIChzbmFtZSwgZnVuYywgaW5pdCkge1xyXG4gICAgdmFyIG5hbWUgPSBwcm9wTmFtZShzbmFtZSk7XHJcbiAgICBHTF9TVEFURV9OQU1FUy5wdXNoKHNuYW1lKTtcclxuICAgIGlmIChBcnJheS5pc0FycmF5KGluaXQpKSB7XHJcbiAgICAgIGN1cnJlbnRTdGF0ZVtuYW1lXSA9IGluaXQuc2xpY2UoKTtcclxuICAgICAgbmV4dFN0YXRlW25hbWVdID0gaW5pdC5zbGljZSgpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY3VycmVudFN0YXRlW25hbWVdID0gbmV4dFN0YXRlW25hbWVdID0gaW5pdDtcclxuICAgIH1cclxuICAgIEdMX1ZBUklBQkxFU1tuYW1lXSA9IGZ1bmM7XHJcbiAgfVxyXG5cclxuICAvLyBEaXRoZXJpbmdcclxuICBzdGF0ZUZsYWcoU19ESVRIRVIsIEdMX0RJVEhFUik7XHJcblxyXG4gIC8vIEJsZW5kaW5nXHJcbiAgc3RhdGVGbGFnKFNfQkxFTkRfRU5BQkxFLCBHTF9CTEVORCk7XHJcbiAgc3RhdGVWYXJpYWJsZShTX0JMRU5EX0NPTE9SLCAnYmxlbmRDb2xvcicsIFswLCAwLCAwLCAwXSk7XHJcbiAgc3RhdGVWYXJpYWJsZShTX0JMRU5EX0VRVUFUSU9OLCAnYmxlbmRFcXVhdGlvblNlcGFyYXRlJyxcclxuICAgIFtHTF9GVU5DX0FERCwgR0xfRlVOQ19BRERdKTtcclxuICBzdGF0ZVZhcmlhYmxlKFNfQkxFTkRfRlVOQywgJ2JsZW5kRnVuY1NlcGFyYXRlJyxcclxuICAgIFtHTF9PTkUsIEdMX1pFUk8sIEdMX09ORSwgR0xfWkVST10pO1xyXG5cclxuICAvLyBEZXB0aFxyXG4gIHN0YXRlRmxhZyhTX0RFUFRIX0VOQUJMRSwgR0xfREVQVEhfVEVTVCwgdHJ1ZSk7XHJcbiAgc3RhdGVWYXJpYWJsZShTX0RFUFRIX0ZVTkMsICdkZXB0aEZ1bmMnLCBHTF9MRVNTKTtcclxuICBzdGF0ZVZhcmlhYmxlKFNfREVQVEhfUkFOR0UsICdkZXB0aFJhbmdlJywgWzAsIDFdKTtcclxuICBzdGF0ZVZhcmlhYmxlKFNfREVQVEhfTUFTSywgJ2RlcHRoTWFzaycsIHRydWUpO1xyXG5cclxuICAvLyBDb2xvciBtYXNrXHJcbiAgc3RhdGVWYXJpYWJsZShTX0NPTE9SX01BU0ssIFNfQ09MT1JfTUFTSywgW3RydWUsIHRydWUsIHRydWUsIHRydWVdKTtcclxuXHJcbiAgLy8gRmFjZSBjdWxsaW5nXHJcbiAgc3RhdGVGbGFnKFNfQ1VMTF9FTkFCTEUsIEdMX0NVTExfRkFDRSk7XHJcbiAgc3RhdGVWYXJpYWJsZShTX0NVTExfRkFDRSwgJ2N1bGxGYWNlJywgR0xfQkFDSyk7XHJcblxyXG4gIC8vIEZyb250IGZhY2Ugb3JpZW50YXRpb25cclxuICBzdGF0ZVZhcmlhYmxlKFNfRlJPTlRfRkFDRSwgU19GUk9OVF9GQUNFLCBHTF9DQ1cpO1xyXG5cclxuICAvLyBMaW5lIHdpZHRoXHJcbiAgc3RhdGVWYXJpYWJsZShTX0xJTkVfV0lEVEgsIFNfTElORV9XSURUSCwgMSk7XHJcblxyXG4gIC8vIFBvbHlnb24gb2Zmc2V0XHJcbiAgc3RhdGVGbGFnKFNfUE9MWUdPTl9PRkZTRVRfRU5BQkxFLCBHTF9QT0xZR09OX09GRlNFVF9GSUxMKTtcclxuICBzdGF0ZVZhcmlhYmxlKFNfUE9MWUdPTl9PRkZTRVRfT0ZGU0VULCAncG9seWdvbk9mZnNldCcsIFswLCAwXSk7XHJcblxyXG4gIC8vIFNhbXBsZSBjb3ZlcmFnZVxyXG4gIHN0YXRlRmxhZyhTX1NBTVBMRV9BTFBIQSwgR0xfU0FNUExFX0FMUEhBX1RPX0NPVkVSQUdFKTtcclxuICBzdGF0ZUZsYWcoU19TQU1QTEVfRU5BQkxFLCBHTF9TQU1QTEVfQ09WRVJBR0UpO1xyXG4gIHN0YXRlVmFyaWFibGUoU19TQU1QTEVfQ09WRVJBR0UsICdzYW1wbGVDb3ZlcmFnZScsIFsxLCBmYWxzZV0pO1xyXG5cclxuICAvLyBTdGVuY2lsXHJcbiAgc3RhdGVGbGFnKFNfU1RFTkNJTF9FTkFCTEUsIEdMX1NURU5DSUxfVEVTVCk7XHJcbiAgc3RhdGVWYXJpYWJsZShTX1NURU5DSUxfTUFTSywgJ3N0ZW5jaWxNYXNrJywgLTEpO1xyXG4gIHN0YXRlVmFyaWFibGUoU19TVEVOQ0lMX0ZVTkMsICdzdGVuY2lsRnVuYycsIFtHTF9BTFdBWVMsIDAsIC0xXSk7XHJcbiAgc3RhdGVWYXJpYWJsZShTX1NURU5DSUxfT1BGUk9OVCwgJ3N0ZW5jaWxPcFNlcGFyYXRlJyxcclxuICAgIFtHTF9GUk9OVCwgR0xfS0VFUCwgR0xfS0VFUCwgR0xfS0VFUF0pO1xyXG4gIHN0YXRlVmFyaWFibGUoU19TVEVOQ0lMX09QQkFDSywgJ3N0ZW5jaWxPcFNlcGFyYXRlJyxcclxuICAgIFtHTF9CQUNLLCBHTF9LRUVQLCBHTF9LRUVQLCBHTF9LRUVQXSk7XHJcblxyXG4gIC8vIFNjaXNzb3JcclxuICBzdGF0ZUZsYWcoU19TQ0lTU09SX0VOQUJMRSwgR0xfU0NJU1NPUl9URVNUKTtcclxuICBzdGF0ZVZhcmlhYmxlKFNfU0NJU1NPUl9CT1gsICdzY2lzc29yJyxcclxuICAgIFswLCAwLCBnbC5kcmF3aW5nQnVmZmVyV2lkdGgsIGdsLmRyYXdpbmdCdWZmZXJIZWlnaHRdKTtcclxuXHJcbiAgLy8gVmlld3BvcnRcclxuICBzdGF0ZVZhcmlhYmxlKFNfVklFV1BPUlQsIFNfVklFV1BPUlQsXHJcbiAgICBbMCwgMCwgZ2wuZHJhd2luZ0J1ZmZlcldpZHRoLCBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0XSk7XHJcblxyXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gIC8vIEVOVklST05NRU5UXHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgdmFyIHNoYXJlZFN0YXRlID0ge1xyXG4gICAgZ2w6IGdsLFxyXG4gICAgY29udGV4dDogY29udGV4dFN0YXRlLFxyXG4gICAgc3RyaW5nczogc3RyaW5nU3RvcmUsXHJcbiAgICBuZXh0OiBuZXh0U3RhdGUsXHJcbiAgICBjdXJyZW50OiBjdXJyZW50U3RhdGUsXHJcbiAgICBkcmF3OiBkcmF3U3RhdGUsXHJcbiAgICBlbGVtZW50czogZWxlbWVudFN0YXRlLFxyXG4gICAgYnVmZmVyOiBidWZmZXJTdGF0ZSxcclxuICAgIHNoYWRlcjogc2hhZGVyU3RhdGUsXHJcbiAgICBhdHRyaWJ1dGVzOiBhdHRyaWJ1dGVTdGF0ZS5zdGF0ZSxcclxuICAgIHVuaWZvcm1zOiB1bmlmb3JtU3RhdGUsXHJcbiAgICBmcmFtZWJ1ZmZlcjogZnJhbWVidWZmZXJTdGF0ZSxcclxuICAgIGV4dGVuc2lvbnM6IGV4dGVuc2lvbnMsXHJcblxyXG4gICAgdGltZXI6IHRpbWVyLFxyXG4gICAgaXNCdWZmZXJBcmdzOiBpc0J1ZmZlckFyZ3NcclxuICB9O1xyXG5cclxuICB2YXIgc2hhcmVkQ29uc3RhbnRzID0ge1xyXG4gICAgcHJpbVR5cGVzOiBwcmltVHlwZXMsXHJcbiAgICBjb21wYXJlRnVuY3M6IGNvbXBhcmVGdW5jcyxcclxuICAgIGJsZW5kRnVuY3M6IGJsZW5kRnVuY3MsXHJcbiAgICBibGVuZEVxdWF0aW9uczogYmxlbmRFcXVhdGlvbnMsXHJcbiAgICBzdGVuY2lsT3BzOiBzdGVuY2lsT3BzLFxyXG4gICAgZ2xUeXBlczogZ2xUeXBlcyxcclxuICAgIG9yaWVudGF0aW9uVHlwZTogb3JpZW50YXRpb25UeXBlXHJcbiAgfTtcclxuXHJcbiAgY2hlY2skMS5vcHRpb25hbChmdW5jdGlvbiAoKSB7XHJcbiAgICBzaGFyZWRTdGF0ZS5pc0FycmF5TGlrZSA9IGlzQXJyYXlMaWtlO1xyXG4gIH0pO1xyXG5cclxuICBpZiAoZXh0RHJhd0J1ZmZlcnMpIHtcclxuICAgIHNoYXJlZENvbnN0YW50cy5iYWNrQnVmZmVyID0gW0dMX0JBQ0tdO1xyXG4gICAgc2hhcmVkQ29uc3RhbnRzLmRyYXdCdWZmZXIgPSBsb29wKGxpbWl0cy5tYXhEcmF3YnVmZmVycywgZnVuY3Rpb24gKGkpIHtcclxuICAgICAgaWYgKGkgPT09IDApIHtcclxuICAgICAgICByZXR1cm4gWzBdXHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIGxvb3AoaSwgZnVuY3Rpb24gKGopIHtcclxuICAgICAgICByZXR1cm4gR0xfQ09MT1JfQVRUQUNITUVOVDAkMiArIGpcclxuICAgICAgfSlcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgdmFyIGRyYXdDYWxsQ291bnRlciA9IDA7XHJcbiAgZnVuY3Rpb24gY3JlYXRlUkVHTEVudmlyb25tZW50ICgpIHtcclxuICAgIHZhciBlbnYgPSBjcmVhdGVFbnZpcm9ubWVudCgpO1xyXG4gICAgdmFyIGxpbmsgPSBlbnYubGluaztcclxuICAgIHZhciBnbG9iYWwgPSBlbnYuZ2xvYmFsO1xyXG4gICAgZW52LmlkID0gZHJhd0NhbGxDb3VudGVyKys7XHJcblxyXG4gICAgZW52LmJhdGNoSWQgPSAnMCc7XHJcblxyXG4gICAgLy8gbGluayBzaGFyZWQgc3RhdGVcclxuICAgIHZhciBTSEFSRUQgPSBsaW5rKHNoYXJlZFN0YXRlKTtcclxuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkID0ge1xyXG4gICAgICBwcm9wczogJ2EwJ1xyXG4gICAgfTtcclxuICAgIE9iamVjdC5rZXlzKHNoYXJlZFN0YXRlKS5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XHJcbiAgICAgIHNoYXJlZFtwcm9wXSA9IGdsb2JhbC5kZWYoU0hBUkVELCAnLicsIHByb3ApO1xyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gSW5qZWN0IHJ1bnRpbWUgYXNzZXJ0aW9uIHN0dWZmIGZvciBkZWJ1ZyBidWlsZHNcclxuICAgIGNoZWNrJDEub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xyXG4gICAgICBlbnYuQ0hFQ0sgPSBsaW5rKGNoZWNrJDEpO1xyXG4gICAgICBlbnYuY29tbWFuZFN0ciA9IGNoZWNrJDEuZ3Vlc3NDb21tYW5kKCk7XHJcbiAgICAgIGVudi5jb21tYW5kID0gbGluayhlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgIGVudi5hc3NlcnQgPSBmdW5jdGlvbiAoYmxvY2ssIHByZWQsIG1lc3NhZ2UpIHtcclxuICAgICAgICBibG9jayhcclxuICAgICAgICAgICdpZighKCcsIHByZWQsICcpKScsXHJcbiAgICAgICAgICB0aGlzLkNIRUNLLCAnLmNvbW1hbmRSYWlzZSgnLCBsaW5rKG1lc3NhZ2UpLCAnLCcsIHRoaXMuY29tbWFuZCwgJyk7Jyk7XHJcbiAgICAgIH07XHJcblxyXG4gICAgICBzaGFyZWRDb25zdGFudHMuaW52YWxpZEJsZW5kQ29tYmluYXRpb25zID0gaW52YWxpZEJsZW5kQ29tYmluYXRpb25zO1xyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ29weSBHTCBzdGF0ZSB2YXJpYWJsZXMgb3ZlclxyXG4gICAgdmFyIG5leHRWYXJzID0gZW52Lm5leHQgPSB7fTtcclxuICAgIHZhciBjdXJyZW50VmFycyA9IGVudi5jdXJyZW50ID0ge307XHJcbiAgICBPYmplY3Qua2V5cyhHTF9WQVJJQUJMRVMpLmZvckVhY2goZnVuY3Rpb24gKHZhcmlhYmxlKSB7XHJcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KGN1cnJlbnRTdGF0ZVt2YXJpYWJsZV0pKSB7XHJcbiAgICAgICAgbmV4dFZhcnNbdmFyaWFibGVdID0gZ2xvYmFsLmRlZihzaGFyZWQubmV4dCwgJy4nLCB2YXJpYWJsZSk7XHJcbiAgICAgICAgY3VycmVudFZhcnNbdmFyaWFibGVdID0gZ2xvYmFsLmRlZihzaGFyZWQuY3VycmVudCwgJy4nLCB2YXJpYWJsZSk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEluaXRpYWxpemUgc2hhcmVkIGNvbnN0YW50c1xyXG4gICAgdmFyIGNvbnN0YW50cyA9IGVudi5jb25zdGFudHMgPSB7fTtcclxuICAgIE9iamVjdC5rZXlzKHNoYXJlZENvbnN0YW50cykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xyXG4gICAgICBjb25zdGFudHNbbmFtZV0gPSBnbG9iYWwuZGVmKEpTT04uc3RyaW5naWZ5KHNoYXJlZENvbnN0YW50c1tuYW1lXSkpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gSGVscGVyIGZ1bmN0aW9uIGZvciBjYWxsaW5nIGEgYmxvY2tcclxuICAgIGVudi5pbnZva2UgPSBmdW5jdGlvbiAoYmxvY2ssIHgpIHtcclxuICAgICAgc3dpdGNoICh4LnR5cGUpIHtcclxuICAgICAgICBjYXNlIERZTl9GVU5DJDE6XHJcbiAgICAgICAgICB2YXIgYXJnTGlzdCA9IFtcclxuICAgICAgICAgICAgJ3RoaXMnLFxyXG4gICAgICAgICAgICBzaGFyZWQuY29udGV4dCxcclxuICAgICAgICAgICAgc2hhcmVkLnByb3BzLFxyXG4gICAgICAgICAgICBlbnYuYmF0Y2hJZFxyXG4gICAgICAgICAgXTtcclxuICAgICAgICAgIHJldHVybiBibG9jay5kZWYoXHJcbiAgICAgICAgICAgIGxpbmsoeC5kYXRhKSwgJy5jYWxsKCcsXHJcbiAgICAgICAgICAgICAgYXJnTGlzdC5zbGljZSgwLCBNYXRoLm1heCh4LmRhdGEubGVuZ3RoICsgMSwgNCkpLFxyXG4gICAgICAgICAgICAgJyknKVxyXG4gICAgICAgIGNhc2UgRFlOX1BST1AkMTpcclxuICAgICAgICAgIHJldHVybiBibG9jay5kZWYoc2hhcmVkLnByb3BzLCB4LmRhdGEpXHJcbiAgICAgICAgY2FzZSBEWU5fQ09OVEVYVCQxOlxyXG4gICAgICAgICAgcmV0dXJuIGJsb2NrLmRlZihzaGFyZWQuY29udGV4dCwgeC5kYXRhKVxyXG4gICAgICAgIGNhc2UgRFlOX1NUQVRFJDE6XHJcbiAgICAgICAgICByZXR1cm4gYmxvY2suZGVmKCd0aGlzJywgeC5kYXRhKVxyXG4gICAgICAgIGNhc2UgRFlOX1RIVU5LOlxyXG4gICAgICAgICAgeC5kYXRhLmFwcGVuZChlbnYsIGJsb2NrKTtcclxuICAgICAgICAgIHJldHVybiB4LmRhdGEucmVmXHJcbiAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgZW52LmF0dHJpYkNhY2hlID0ge307XHJcblxyXG4gICAgdmFyIHNjb3BlQXR0cmlicyA9IHt9O1xyXG4gICAgZW52LnNjb3BlQXR0cmliID0gZnVuY3Rpb24gKG5hbWUpIHtcclxuICAgICAgdmFyIGlkID0gc3RyaW5nU3RvcmUuaWQobmFtZSk7XHJcbiAgICAgIGlmIChpZCBpbiBzY29wZUF0dHJpYnMpIHtcclxuICAgICAgICByZXR1cm4gc2NvcGVBdHRyaWJzW2lkXVxyXG4gICAgICB9XHJcbiAgICAgIHZhciBiaW5kaW5nID0gYXR0cmlidXRlU3RhdGUuc2NvcGVbaWRdO1xyXG4gICAgICBpZiAoIWJpbmRpbmcpIHtcclxuICAgICAgICBiaW5kaW5nID0gYXR0cmlidXRlU3RhdGUuc2NvcGVbaWRdID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpO1xyXG4gICAgICB9XHJcbiAgICAgIHZhciByZXN1bHQgPSBzY29wZUF0dHJpYnNbaWRdID0gbGluayhiaW5kaW5nKTtcclxuICAgICAgcmV0dXJuIHJlc3VsdFxyXG4gICAgfTtcclxuXHJcbiAgICByZXR1cm4gZW52XHJcbiAgfVxyXG5cclxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAvLyBQQVJTSU5HXHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgZnVuY3Rpb24gcGFyc2VQcm9maWxlIChvcHRpb25zKSB7XHJcbiAgICB2YXIgc3RhdGljT3B0aW9ucyA9IG9wdGlvbnMuc3RhdGljO1xyXG4gICAgdmFyIGR5bmFtaWNPcHRpb25zID0gb3B0aW9ucy5keW5hbWljO1xyXG5cclxuICAgIHZhciBwcm9maWxlRW5hYmxlO1xyXG4gICAgaWYgKFNfUFJPRklMRSBpbiBzdGF0aWNPcHRpb25zKSB7XHJcbiAgICAgIHZhciB2YWx1ZSA9ICEhc3RhdGljT3B0aW9uc1tTX1BST0ZJTEVdO1xyXG4gICAgICBwcm9maWxlRW5hYmxlID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xyXG4gICAgICAgIHJldHVybiB2YWx1ZVxyXG4gICAgICB9KTtcclxuICAgICAgcHJvZmlsZUVuYWJsZS5lbmFibGUgPSB2YWx1ZTtcclxuICAgIH0gZWxzZSBpZiAoU19QUk9GSUxFIGluIGR5bmFtaWNPcHRpb25zKSB7XHJcbiAgICAgIHZhciBkeW4gPSBkeW5hbWljT3B0aW9uc1tTX1BST0ZJTEVdO1xyXG4gICAgICBwcm9maWxlRW5hYmxlID0gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xyXG4gICAgICAgIHJldHVybiBlbnYuaW52b2tlKHNjb3BlLCBkeW4pXHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBwcm9maWxlRW5hYmxlXHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBwYXJzZUZyYW1lYnVmZmVyIChvcHRpb25zLCBlbnYpIHtcclxuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWM7XHJcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWM7XHJcblxyXG4gICAgaWYgKFNfRlJBTUVCVUZGRVIgaW4gc3RhdGljT3B0aW9ucykge1xyXG4gICAgICB2YXIgZnJhbWVidWZmZXIgPSBzdGF0aWNPcHRpb25zW1NfRlJBTUVCVUZGRVJdO1xyXG4gICAgICBpZiAoZnJhbWVidWZmZXIpIHtcclxuICAgICAgICBmcmFtZWJ1ZmZlciA9IGZyYW1lYnVmZmVyU3RhdGUuZ2V0RnJhbWVidWZmZXIoZnJhbWVidWZmZXIpO1xyXG4gICAgICAgIGNoZWNrJDEuY29tbWFuZChmcmFtZWJ1ZmZlciwgJ2ludmFsaWQgZnJhbWVidWZmZXIgb2JqZWN0Jyk7XHJcbiAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgYmxvY2spIHtcclxuICAgICAgICAgIHZhciBGUkFNRUJVRkZFUiA9IGVudi5saW5rKGZyYW1lYnVmZmVyKTtcclxuICAgICAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkO1xyXG4gICAgICAgICAgYmxvY2suc2V0KFxyXG4gICAgICAgICAgICBzaGFyZWQuZnJhbWVidWZmZXIsXHJcbiAgICAgICAgICAgICcubmV4dCcsXHJcbiAgICAgICAgICAgIEZSQU1FQlVGRkVSKTtcclxuICAgICAgICAgIHZhciBDT05URVhUID0gc2hhcmVkLmNvbnRleHQ7XHJcbiAgICAgICAgICBibG9jay5zZXQoXHJcbiAgICAgICAgICAgIENPTlRFWFQsXHJcbiAgICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfV0lEVEgsXHJcbiAgICAgICAgICAgIEZSQU1FQlVGRkVSICsgJy53aWR0aCcpO1xyXG4gICAgICAgICAgYmxvY2suc2V0KFxyXG4gICAgICAgICAgICBDT05URVhULFxyXG4gICAgICAgICAgICAnLicgKyBTX0ZSQU1FQlVGRkVSX0hFSUdIVCxcclxuICAgICAgICAgICAgRlJBTUVCVUZGRVIgKyAnLmhlaWdodCcpO1xyXG4gICAgICAgICAgcmV0dXJuIEZSQU1FQlVGRkVSXHJcbiAgICAgICAgfSlcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xyXG4gICAgICAgICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWQ7XHJcbiAgICAgICAgICBzY29wZS5zZXQoXHJcbiAgICAgICAgICAgIHNoYXJlZC5mcmFtZWJ1ZmZlcixcclxuICAgICAgICAgICAgJy5uZXh0JyxcclxuICAgICAgICAgICAgJ251bGwnKTtcclxuICAgICAgICAgIHZhciBDT05URVhUID0gc2hhcmVkLmNvbnRleHQ7XHJcbiAgICAgICAgICBzY29wZS5zZXQoXHJcbiAgICAgICAgICAgIENPTlRFWFQsXHJcbiAgICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfV0lEVEgsXHJcbiAgICAgICAgICAgIENPTlRFWFQgKyAnLicgKyBTX0RSQVdJTkdCVUZGRVJfV0lEVEgpO1xyXG4gICAgICAgICAgc2NvcGUuc2V0KFxyXG4gICAgICAgICAgICBDT05URVhULFxyXG4gICAgICAgICAgICAnLicgKyBTX0ZSQU1FQlVGRkVSX0hFSUdIVCxcclxuICAgICAgICAgICAgQ09OVEVYVCArICcuJyArIFNfRFJBV0lOR0JVRkZFUl9IRUlHSFQpO1xyXG4gICAgICAgICAgcmV0dXJuICdudWxsJ1xyXG4gICAgICAgIH0pXHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSBpZiAoU19GUkFNRUJVRkZFUiBpbiBkeW5hbWljT3B0aW9ucykge1xyXG4gICAgICB2YXIgZHluID0gZHluYW1pY09wdGlvbnNbU19GUkFNRUJVRkZFUl07XHJcbiAgICAgIHJldHVybiBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XHJcbiAgICAgICAgdmFyIEZSQU1FQlVGRkVSX0ZVTkMgPSBlbnYuaW52b2tlKHNjb3BlLCBkeW4pO1xyXG4gICAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkO1xyXG4gICAgICAgIHZhciBGUkFNRUJVRkZFUl9TVEFURSA9IHNoYXJlZC5mcmFtZWJ1ZmZlcjtcclxuICAgICAgICB2YXIgRlJBTUVCVUZGRVIgPSBzY29wZS5kZWYoXHJcbiAgICAgICAgICBGUkFNRUJVRkZFUl9TVEFURSwgJy5nZXRGcmFtZWJ1ZmZlcignLCBGUkFNRUJVRkZFUl9GVU5DLCAnKScpO1xyXG5cclxuICAgICAgICBjaGVjayQxLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXHJcbiAgICAgICAgICAgICchJyArIEZSQU1FQlVGRkVSX0ZVTkMgKyAnfHwnICsgRlJBTUVCVUZGRVIsXHJcbiAgICAgICAgICAgICdpbnZhbGlkIGZyYW1lYnVmZmVyIG9iamVjdCcpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBzY29wZS5zZXQoXHJcbiAgICAgICAgICBGUkFNRUJVRkZFUl9TVEFURSxcclxuICAgICAgICAgICcubmV4dCcsXHJcbiAgICAgICAgICBGUkFNRUJVRkZFUik7XHJcbiAgICAgICAgdmFyIENPTlRFWFQgPSBzaGFyZWQuY29udGV4dDtcclxuICAgICAgICBzY29wZS5zZXQoXHJcbiAgICAgICAgICBDT05URVhULFxyXG4gICAgICAgICAgJy4nICsgU19GUkFNRUJVRkZFUl9XSURUSCxcclxuICAgICAgICAgIEZSQU1FQlVGRkVSICsgJz8nICsgRlJBTUVCVUZGRVIgKyAnLndpZHRoOicgK1xyXG4gICAgICAgICAgQ09OVEVYVCArICcuJyArIFNfRFJBV0lOR0JVRkZFUl9XSURUSCk7XHJcbiAgICAgICAgc2NvcGUuc2V0KFxyXG4gICAgICAgICAgQ09OVEVYVCxcclxuICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfSEVJR0hULFxyXG4gICAgICAgICAgRlJBTUVCVUZGRVIgK1xyXG4gICAgICAgICAgJz8nICsgRlJBTUVCVUZGRVIgKyAnLmhlaWdodDonICtcclxuICAgICAgICAgIENPTlRFWFQgKyAnLicgKyBTX0RSQVdJTkdCVUZGRVJfSEVJR0hUKTtcclxuICAgICAgICByZXR1cm4gRlJBTUVCVUZGRVJcclxuICAgICAgfSlcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHJldHVybiBudWxsXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBwYXJzZVZpZXdwb3J0U2Npc3NvciAob3B0aW9ucywgZnJhbWVidWZmZXIsIGVudikge1xyXG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpYztcclxuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pYztcclxuXHJcbiAgICBmdW5jdGlvbiBwYXJzZUJveCAocGFyYW0pIHtcclxuICAgICAgaWYgKHBhcmFtIGluIHN0YXRpY09wdGlvbnMpIHtcclxuICAgICAgICB2YXIgYm94ID0gc3RhdGljT3B0aW9uc1twYXJhbV07XHJcbiAgICAgICAgY2hlY2skMS5jb21tYW5kVHlwZShib3gsICdvYmplY3QnLCAnaW52YWxpZCAnICsgcGFyYW0sIGVudi5jb21tYW5kU3RyKTtcclxuXHJcbiAgICAgICAgdmFyIGlzU3RhdGljID0gdHJ1ZTtcclxuICAgICAgICB2YXIgeCA9IGJveC54IHwgMDtcclxuICAgICAgICB2YXIgeSA9IGJveC55IHwgMDtcclxuICAgICAgICB2YXIgdywgaDtcclxuICAgICAgICBpZiAoJ3dpZHRoJyBpbiBib3gpIHtcclxuICAgICAgICAgIHcgPSBib3gud2lkdGggfCAwO1xyXG4gICAgICAgICAgY2hlY2skMS5jb21tYW5kKHcgPj0gMCwgJ2ludmFsaWQgJyArIHBhcmFtLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGlzU3RhdGljID0gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICgnaGVpZ2h0JyBpbiBib3gpIHtcclxuICAgICAgICAgIGggPSBib3guaGVpZ2h0IHwgMDtcclxuICAgICAgICAgIGNoZWNrJDEuY29tbWFuZChoID49IDAsICdpbnZhbGlkICcgKyBwYXJhbSwgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBpc1N0YXRpYyA9IGZhbHNlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcclxuICAgICAgICAgICFpc1N0YXRpYyAmJiBmcmFtZWJ1ZmZlciAmJiBmcmFtZWJ1ZmZlci50aGlzRGVwLFxyXG4gICAgICAgICAgIWlzU3RhdGljICYmIGZyYW1lYnVmZmVyICYmIGZyYW1lYnVmZmVyLmNvbnRleHREZXAsXHJcbiAgICAgICAgICAhaXNTdGF0aWMgJiYgZnJhbWVidWZmZXIgJiYgZnJhbWVidWZmZXIucHJvcERlcCxcclxuICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XHJcbiAgICAgICAgICAgIHZhciBDT05URVhUID0gZW52LnNoYXJlZC5jb250ZXh0O1xyXG4gICAgICAgICAgICB2YXIgQk9YX1cgPSB3O1xyXG4gICAgICAgICAgICBpZiAoISgnd2lkdGgnIGluIGJveCkpIHtcclxuICAgICAgICAgICAgICBCT1hfVyA9IHNjb3BlLmRlZihDT05URVhULCAnLicsIFNfRlJBTUVCVUZGRVJfV0lEVEgsICctJywgeCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdmFyIEJPWF9IID0gaDtcclxuICAgICAgICAgICAgaWYgKCEoJ2hlaWdodCcgaW4gYm94KSkge1xyXG4gICAgICAgICAgICAgIEJPWF9IID0gc2NvcGUuZGVmKENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9IRUlHSFQsICctJywgeSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIFt4LCB5LCBCT1hfVywgQk9YX0hdXHJcbiAgICAgICAgICB9KVxyXG4gICAgICB9IGVsc2UgaWYgKHBhcmFtIGluIGR5bmFtaWNPcHRpb25zKSB7XHJcbiAgICAgICAgdmFyIGR5bkJveCA9IGR5bmFtaWNPcHRpb25zW3BhcmFtXTtcclxuICAgICAgICB2YXIgcmVzdWx0ID0gY3JlYXRlRHluYW1pY0RlY2woZHluQm94LCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xyXG4gICAgICAgICAgdmFyIEJPWCA9IGVudi5pbnZva2Uoc2NvcGUsIGR5bkJveCk7XHJcblxyXG4gICAgICAgICAgY2hlY2skMS5vcHRpb25hbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXHJcbiAgICAgICAgICAgICAgQk9YICsgJyYmdHlwZW9mICcgKyBCT1ggKyAnPT09XCJvYmplY3RcIicsXHJcbiAgICAgICAgICAgICAgJ2ludmFsaWQgJyArIHBhcmFtKTtcclxuICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgIHZhciBDT05URVhUID0gZW52LnNoYXJlZC5jb250ZXh0O1xyXG4gICAgICAgICAgdmFyIEJPWF9YID0gc2NvcGUuZGVmKEJPWCwgJy54fDAnKTtcclxuICAgICAgICAgIHZhciBCT1hfWSA9IHNjb3BlLmRlZihCT1gsICcueXwwJyk7XHJcbiAgICAgICAgICB2YXIgQk9YX1cgPSBzY29wZS5kZWYoXHJcbiAgICAgICAgICAgICdcIndpZHRoXCIgaW4gJywgQk9YLCAnPycsIEJPWCwgJy53aWR0aHwwOicsXHJcbiAgICAgICAgICAgICcoJywgQ09OVEVYVCwgJy4nLCBTX0ZSQU1FQlVGRkVSX1dJRFRILCAnLScsIEJPWF9YLCAnKScpO1xyXG4gICAgICAgICAgdmFyIEJPWF9IID0gc2NvcGUuZGVmKFxyXG4gICAgICAgICAgICAnXCJoZWlnaHRcIiBpbiAnLCBCT1gsICc/JywgQk9YLCAnLmhlaWdodHwwOicsXHJcbiAgICAgICAgICAgICcoJywgQ09OVEVYVCwgJy4nLCBTX0ZSQU1FQlVGRkVSX0hFSUdIVCwgJy0nLCBCT1hfWSwgJyknKTtcclxuXHJcbiAgICAgICAgICBjaGVjayQxLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcclxuICAgICAgICAgICAgICBCT1hfVyArICc+PTAmJicgK1xyXG4gICAgICAgICAgICAgIEJPWF9IICsgJz49MCcsXHJcbiAgICAgICAgICAgICAgJ2ludmFsaWQgJyArIHBhcmFtKTtcclxuICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgIHJldHVybiBbQk9YX1gsIEJPWF9ZLCBCT1hfVywgQk9YX0hdXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgaWYgKGZyYW1lYnVmZmVyKSB7XHJcbiAgICAgICAgICByZXN1bHQudGhpc0RlcCA9IHJlc3VsdC50aGlzRGVwIHx8IGZyYW1lYnVmZmVyLnRoaXNEZXA7XHJcbiAgICAgICAgICByZXN1bHQuY29udGV4dERlcCA9IHJlc3VsdC5jb250ZXh0RGVwIHx8IGZyYW1lYnVmZmVyLmNvbnRleHREZXA7XHJcbiAgICAgICAgICByZXN1bHQucHJvcERlcCA9IHJlc3VsdC5wcm9wRGVwIHx8IGZyYW1lYnVmZmVyLnByb3BEZXA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiByZXN1bHRcclxuICAgICAgfSBlbHNlIGlmIChmcmFtZWJ1ZmZlcikge1xyXG4gICAgICAgIHJldHVybiBuZXcgRGVjbGFyYXRpb24oXHJcbiAgICAgICAgICBmcmFtZWJ1ZmZlci50aGlzRGVwLFxyXG4gICAgICAgICAgZnJhbWVidWZmZXIuY29udGV4dERlcCxcclxuICAgICAgICAgIGZyYW1lYnVmZmVyLnByb3BEZXAsXHJcbiAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xyXG4gICAgICAgICAgICB2YXIgQ09OVEVYVCA9IGVudi5zaGFyZWQuY29udGV4dDtcclxuICAgICAgICAgICAgcmV0dXJuIFtcclxuICAgICAgICAgICAgICAwLCAwLFxyXG4gICAgICAgICAgICAgIHNjb3BlLmRlZihDT05URVhULCAnLicsIFNfRlJBTUVCVUZGRVJfV0lEVEgpLFxyXG4gICAgICAgICAgICAgIHNjb3BlLmRlZihDT05URVhULCAnLicsIFNfRlJBTUVCVUZGRVJfSEVJR0hUKV1cclxuICAgICAgICAgIH0pXHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcmV0dXJuIG51bGxcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHZhciB2aWV3cG9ydCA9IHBhcnNlQm94KFNfVklFV1BPUlQpO1xyXG5cclxuICAgIGlmICh2aWV3cG9ydCkge1xyXG4gICAgICB2YXIgcHJldlZpZXdwb3J0ID0gdmlld3BvcnQ7XHJcbiAgICAgIHZpZXdwb3J0ID0gbmV3IERlY2xhcmF0aW9uKFxyXG4gICAgICAgIHZpZXdwb3J0LnRoaXNEZXAsXHJcbiAgICAgICAgdmlld3BvcnQuY29udGV4dERlcCxcclxuICAgICAgICB2aWV3cG9ydC5wcm9wRGVwLFxyXG4gICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XHJcbiAgICAgICAgICB2YXIgVklFV1BPUlQgPSBwcmV2Vmlld3BvcnQuYXBwZW5kKGVudiwgc2NvcGUpO1xyXG4gICAgICAgICAgdmFyIENPTlRFWFQgPSBlbnYuc2hhcmVkLmNvbnRleHQ7XHJcbiAgICAgICAgICBzY29wZS5zZXQoXHJcbiAgICAgICAgICAgIENPTlRFWFQsXHJcbiAgICAgICAgICAgICcuJyArIFNfVklFV1BPUlRfV0lEVEgsXHJcbiAgICAgICAgICAgIFZJRVdQT1JUWzJdKTtcclxuICAgICAgICAgIHNjb3BlLnNldChcclxuICAgICAgICAgICAgQ09OVEVYVCxcclxuICAgICAgICAgICAgJy4nICsgU19WSUVXUE9SVF9IRUlHSFQsXHJcbiAgICAgICAgICAgIFZJRVdQT1JUWzNdKTtcclxuICAgICAgICAgIHJldHVybiBWSUVXUE9SVFxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgIHZpZXdwb3J0OiB2aWV3cG9ydCxcclxuICAgICAgc2Npc3Nvcl9ib3g6IHBhcnNlQm94KFNfU0NJU1NPUl9CT1gpXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBwYXJzZVByb2dyYW0gKG9wdGlvbnMpIHtcclxuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWM7XHJcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWM7XHJcblxyXG4gICAgZnVuY3Rpb24gcGFyc2VTaGFkZXIgKG5hbWUpIHtcclxuICAgICAgaWYgKG5hbWUgaW4gc3RhdGljT3B0aW9ucykge1xyXG4gICAgICAgIHZhciBpZCA9IHN0cmluZ1N0b3JlLmlkKHN0YXRpY09wdGlvbnNbbmFtZV0pO1xyXG4gICAgICAgIGNoZWNrJDEub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgc2hhZGVyU3RhdGUuc2hhZGVyKHNoYWRlclR5cGVbbmFtZV0sIGlkLCBjaGVjayQxLmd1ZXNzQ29tbWFuZCgpKTtcclxuICAgICAgICB9KTtcclxuICAgICAgICB2YXIgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICByZXR1cm4gaWRcclxuICAgICAgICB9KTtcclxuICAgICAgICByZXN1bHQuaWQgPSBpZDtcclxuICAgICAgICByZXR1cm4gcmVzdWx0XHJcbiAgICAgIH0gZWxzZSBpZiAobmFtZSBpbiBkeW5hbWljT3B0aW9ucykge1xyXG4gICAgICAgIHZhciBkeW4gPSBkeW5hbWljT3B0aW9uc1tuYW1lXTtcclxuICAgICAgICByZXR1cm4gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xyXG4gICAgICAgICAgdmFyIHN0ciA9IGVudi5pbnZva2Uoc2NvcGUsIGR5bik7XHJcbiAgICAgICAgICB2YXIgaWQgPSBzY29wZS5kZWYoZW52LnNoYXJlZC5zdHJpbmdzLCAnLmlkKCcsIHN0ciwgJyknKTtcclxuICAgICAgICAgIGNoZWNrJDEub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICBzY29wZShcclxuICAgICAgICAgICAgICBlbnYuc2hhcmVkLnNoYWRlciwgJy5zaGFkZXIoJyxcclxuICAgICAgICAgICAgICBzaGFkZXJUeXBlW25hbWVdLCAnLCcsXHJcbiAgICAgICAgICAgICAgaWQsICcsJyxcclxuICAgICAgICAgICAgICBlbnYuY29tbWFuZCwgJyk7Jyk7XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICAgIHJldHVybiBpZFxyXG4gICAgICAgIH0pXHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIG51bGxcclxuICAgIH1cclxuXHJcbiAgICB2YXIgZnJhZyA9IHBhcnNlU2hhZGVyKFNfRlJBRyk7XHJcbiAgICB2YXIgdmVydCA9IHBhcnNlU2hhZGVyKFNfVkVSVCk7XHJcblxyXG4gICAgdmFyIHByb2dyYW0gPSBudWxsO1xyXG4gICAgdmFyIHByb2dWYXI7XHJcbiAgICBpZiAoaXNTdGF0aWMoZnJhZykgJiYgaXNTdGF0aWModmVydCkpIHtcclxuICAgICAgcHJvZ3JhbSA9IHNoYWRlclN0YXRlLnByb2dyYW0odmVydC5pZCwgZnJhZy5pZCk7XHJcbiAgICAgIHByb2dWYXIgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XHJcbiAgICAgICAgcmV0dXJuIGVudi5saW5rKHByb2dyYW0pXHJcbiAgICAgIH0pO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgcHJvZ1ZhciA9IG5ldyBEZWNsYXJhdGlvbihcclxuICAgICAgICAoZnJhZyAmJiBmcmFnLnRoaXNEZXApIHx8ICh2ZXJ0ICYmIHZlcnQudGhpc0RlcCksXHJcbiAgICAgICAgKGZyYWcgJiYgZnJhZy5jb250ZXh0RGVwKSB8fCAodmVydCAmJiB2ZXJ0LmNvbnRleHREZXApLFxyXG4gICAgICAgIChmcmFnICYmIGZyYWcucHJvcERlcCkgfHwgKHZlcnQgJiYgdmVydC5wcm9wRGVwKSxcclxuICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xyXG4gICAgICAgICAgdmFyIFNIQURFUl9TVEFURSA9IGVudi5zaGFyZWQuc2hhZGVyO1xyXG4gICAgICAgICAgdmFyIGZyYWdJZDtcclxuICAgICAgICAgIGlmIChmcmFnKSB7XHJcbiAgICAgICAgICAgIGZyYWdJZCA9IGZyYWcuYXBwZW5kKGVudiwgc2NvcGUpO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgZnJhZ0lkID0gc2NvcGUuZGVmKFNIQURFUl9TVEFURSwgJy4nLCBTX0ZSQUcpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgdmFyIHZlcnRJZDtcclxuICAgICAgICAgIGlmICh2ZXJ0KSB7XHJcbiAgICAgICAgICAgIHZlcnRJZCA9IHZlcnQuYXBwZW5kKGVudiwgc2NvcGUpO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdmVydElkID0gc2NvcGUuZGVmKFNIQURFUl9TVEFURSwgJy4nLCBTX1ZFUlQpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgdmFyIHByb2dEZWYgPSBTSEFERVJfU1RBVEUgKyAnLnByb2dyYW0oJyArIHZlcnRJZCArICcsJyArIGZyYWdJZDtcclxuICAgICAgICAgIGNoZWNrJDEub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICBwcm9nRGVmICs9ICcsJyArIGVudi5jb21tYW5kO1xyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKHByb2dEZWYgKyAnKScpXHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgZnJhZzogZnJhZyxcclxuICAgICAgdmVydDogdmVydCxcclxuICAgICAgcHJvZ1ZhcjogcHJvZ1ZhcixcclxuICAgICAgcHJvZ3JhbTogcHJvZ3JhbVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gcGFyc2VEcmF3IChvcHRpb25zLCBlbnYpIHtcclxuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWM7XHJcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWM7XHJcblxyXG4gICAgZnVuY3Rpb24gcGFyc2VFbGVtZW50cyAoKSB7XHJcbiAgICAgIGlmIChTX0VMRU1FTlRTIGluIHN0YXRpY09wdGlvbnMpIHtcclxuICAgICAgICB2YXIgZWxlbWVudHMgPSBzdGF0aWNPcHRpb25zW1NfRUxFTUVOVFNdO1xyXG4gICAgICAgIGlmIChpc0J1ZmZlckFyZ3MoZWxlbWVudHMpKSB7XHJcbiAgICAgICAgICBlbGVtZW50cyA9IGVsZW1lbnRTdGF0ZS5nZXRFbGVtZW50cyhlbGVtZW50U3RhdGUuY3JlYXRlKGVsZW1lbnRzLCB0cnVlKSk7XHJcbiAgICAgICAgfSBlbHNlIGlmIChlbGVtZW50cykge1xyXG4gICAgICAgICAgZWxlbWVudHMgPSBlbGVtZW50U3RhdGUuZ2V0RWxlbWVudHMoZWxlbWVudHMpO1xyXG4gICAgICAgICAgY2hlY2skMS5jb21tYW5kKGVsZW1lbnRzLCAnaW52YWxpZCBlbGVtZW50cycsIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcclxuICAgICAgICAgIGlmIChlbGVtZW50cykge1xyXG4gICAgICAgICAgICB2YXIgcmVzdWx0ID0gZW52LmxpbmsoZWxlbWVudHMpO1xyXG4gICAgICAgICAgICBlbnYuRUxFTUVOVFMgPSByZXN1bHQ7XHJcbiAgICAgICAgICAgIHJldHVybiByZXN1bHRcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGVudi5FTEVNRU5UUyA9IG51bGw7XHJcbiAgICAgICAgICByZXR1cm4gbnVsbFxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJlc3VsdC52YWx1ZSA9IGVsZW1lbnRzO1xyXG4gICAgICAgIHJldHVybiByZXN1bHRcclxuICAgICAgfSBlbHNlIGlmIChTX0VMRU1FTlRTIGluIGR5bmFtaWNPcHRpb25zKSB7XHJcbiAgICAgICAgdmFyIGR5biA9IGR5bmFtaWNPcHRpb25zW1NfRUxFTUVOVFNdO1xyXG4gICAgICAgIHJldHVybiBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XHJcbiAgICAgICAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZDtcclxuXHJcbiAgICAgICAgICB2YXIgSVNfQlVGRkVSX0FSR1MgPSBzaGFyZWQuaXNCdWZmZXJBcmdzO1xyXG4gICAgICAgICAgdmFyIEVMRU1FTlRfU1RBVEUgPSBzaGFyZWQuZWxlbWVudHM7XHJcblxyXG4gICAgICAgICAgdmFyIGVsZW1lbnREZWZuID0gZW52Lmludm9rZShzY29wZSwgZHluKTtcclxuICAgICAgICAgIHZhciBlbGVtZW50cyA9IHNjb3BlLmRlZignbnVsbCcpO1xyXG4gICAgICAgICAgdmFyIGVsZW1lbnRTdHJlYW0gPSBzY29wZS5kZWYoSVNfQlVGRkVSX0FSR1MsICcoJywgZWxlbWVudERlZm4sICcpJyk7XHJcblxyXG4gICAgICAgICAgdmFyIGlmdGUgPSBlbnYuY29uZChlbGVtZW50U3RyZWFtKVxyXG4gICAgICAgICAgICAudGhlbihlbGVtZW50cywgJz0nLCBFTEVNRU5UX1NUQVRFLCAnLmNyZWF0ZVN0cmVhbSgnLCBlbGVtZW50RGVmbiwgJyk7JylcclxuICAgICAgICAgICAgLmVsc2UoZWxlbWVudHMsICc9JywgRUxFTUVOVF9TVEFURSwgJy5nZXRFbGVtZW50cygnLCBlbGVtZW50RGVmbiwgJyk7Jyk7XHJcblxyXG4gICAgICAgICAgY2hlY2skMS5vcHRpb25hbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIGVudi5hc3NlcnQoaWZ0ZS5lbHNlLFxyXG4gICAgICAgICAgICAgICchJyArIGVsZW1lbnREZWZuICsgJ3x8JyArIGVsZW1lbnRzLFxyXG4gICAgICAgICAgICAgICdpbnZhbGlkIGVsZW1lbnRzJyk7XHJcbiAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICBzY29wZS5lbnRyeShpZnRlKTtcclxuICAgICAgICAgIHNjb3BlLmV4aXQoXHJcbiAgICAgICAgICAgIGVudi5jb25kKGVsZW1lbnRTdHJlYW0pXHJcbiAgICAgICAgICAgICAgLnRoZW4oRUxFTUVOVF9TVEFURSwgJy5kZXN0cm95U3RyZWFtKCcsIGVsZW1lbnRzLCAnKTsnKSk7XHJcblxyXG4gICAgICAgICAgZW52LkVMRU1FTlRTID0gZWxlbWVudHM7XHJcblxyXG4gICAgICAgICAgcmV0dXJuIGVsZW1lbnRzXHJcbiAgICAgICAgfSlcclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuIG51bGxcclxuICAgIH1cclxuXHJcbiAgICB2YXIgZWxlbWVudHMgPSBwYXJzZUVsZW1lbnRzKCk7XHJcblxyXG4gICAgZnVuY3Rpb24gcGFyc2VQcmltaXRpdmUgKCkge1xyXG4gICAgICBpZiAoU19QUklNSVRJVkUgaW4gc3RhdGljT3B0aW9ucykge1xyXG4gICAgICAgIHZhciBwcmltaXRpdmUgPSBzdGF0aWNPcHRpb25zW1NfUFJJTUlUSVZFXTtcclxuICAgICAgICBjaGVjayQxLmNvbW1hbmRQYXJhbWV0ZXIocHJpbWl0aXZlLCBwcmltVHlwZXMsICdpbnZhbGlkIHByaW1pdHZlJywgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XHJcbiAgICAgICAgICByZXR1cm4gcHJpbVR5cGVzW3ByaW1pdGl2ZV1cclxuICAgICAgICB9KVxyXG4gICAgICB9IGVsc2UgaWYgKFNfUFJJTUlUSVZFIGluIGR5bmFtaWNPcHRpb25zKSB7XHJcbiAgICAgICAgdmFyIGR5blByaW1pdGl2ZSA9IGR5bmFtaWNPcHRpb25zW1NfUFJJTUlUSVZFXTtcclxuICAgICAgICByZXR1cm4gY3JlYXRlRHluYW1pY0RlY2woZHluUHJpbWl0aXZlLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xyXG4gICAgICAgICAgdmFyIFBSSU1fVFlQRVMgPSBlbnYuY29uc3RhbnRzLnByaW1UeXBlcztcclxuICAgICAgICAgIHZhciBwcmltID0gZW52Lmludm9rZShzY29wZSwgZHluUHJpbWl0aXZlKTtcclxuICAgICAgICAgIGNoZWNrJDEub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxyXG4gICAgICAgICAgICAgIHByaW0gKyAnIGluICcgKyBQUklNX1RZUEVTLFxyXG4gICAgICAgICAgICAgICdpbnZhbGlkIHByaW1pdGl2ZSwgbXVzdCBiZSBvbmUgb2YgJyArIE9iamVjdC5rZXlzKHByaW1UeXBlcykpO1xyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKFBSSU1fVFlQRVMsICdbJywgcHJpbSwgJ10nKVxyXG4gICAgICAgIH0pXHJcbiAgICAgIH0gZWxzZSBpZiAoZWxlbWVudHMpIHtcclxuICAgICAgICBpZiAoaXNTdGF0aWMoZWxlbWVudHMpKSB7XHJcbiAgICAgICAgICBpZiAoZWxlbWVudHMudmFsdWUpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcclxuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKGVudi5FTEVNRU5UUywgJy5wcmltVHlwZScpXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIEdMX1RSSUFOR0xFUyQxXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIHJldHVybiBuZXcgRGVjbGFyYXRpb24oXHJcbiAgICAgICAgICAgIGVsZW1lbnRzLnRoaXNEZXAsXHJcbiAgICAgICAgICAgIGVsZW1lbnRzLmNvbnRleHREZXAsXHJcbiAgICAgICAgICAgIGVsZW1lbnRzLnByb3BEZXAsXHJcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XHJcbiAgICAgICAgICAgICAgdmFyIGVsZW1lbnRzID0gZW52LkVMRU1FTlRTO1xyXG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoZWxlbWVudHMsICc/JywgZWxlbWVudHMsICcucHJpbVR5cGU6JywgR0xfVFJJQU5HTEVTJDEpXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBudWxsXHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gcGFyc2VQYXJhbSAocGFyYW0sIGlzT2Zmc2V0KSB7XHJcbiAgICAgIGlmIChwYXJhbSBpbiBzdGF0aWNPcHRpb25zKSB7XHJcbiAgICAgICAgdmFyIHZhbHVlID0gc3RhdGljT3B0aW9uc1twYXJhbV0gfCAwO1xyXG4gICAgICAgIGNoZWNrJDEuY29tbWFuZCghaXNPZmZzZXQgfHwgdmFsdWUgPj0gMCwgJ2ludmFsaWQgJyArIHBhcmFtLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcclxuICAgICAgICAgIGlmIChpc09mZnNldCkge1xyXG4gICAgICAgICAgICBlbnYuT0ZGU0VUID0gdmFsdWU7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICByZXR1cm4gdmFsdWVcclxuICAgICAgICB9KVxyXG4gICAgICB9IGVsc2UgaWYgKHBhcmFtIGluIGR5bmFtaWNPcHRpb25zKSB7XHJcbiAgICAgICAgdmFyIGR5blZhbHVlID0gZHluYW1pY09wdGlvbnNbcGFyYW1dO1xyXG4gICAgICAgIHJldHVybiBjcmVhdGVEeW5hbWljRGVjbChkeW5WYWx1ZSwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcclxuICAgICAgICAgIHZhciByZXN1bHQgPSBlbnYuaW52b2tlKHNjb3BlLCBkeW5WYWx1ZSk7XHJcbiAgICAgICAgICBpZiAoaXNPZmZzZXQpIHtcclxuICAgICAgICAgICAgZW52Lk9GRlNFVCA9IHJlc3VsdDtcclxuICAgICAgICAgICAgY2hlY2skMS5vcHRpb25hbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcclxuICAgICAgICAgICAgICAgIHJlc3VsdCArICc+PTAnLFxyXG4gICAgICAgICAgICAgICAgJ2ludmFsaWQgJyArIHBhcmFtKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICByZXR1cm4gcmVzdWx0XHJcbiAgICAgICAgfSlcclxuICAgICAgfSBlbHNlIGlmIChpc09mZnNldCAmJiBlbGVtZW50cykge1xyXG4gICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XHJcbiAgICAgICAgICBlbnYuT0ZGU0VUID0gJzAnO1xyXG4gICAgICAgICAgcmV0dXJuIDBcclxuICAgICAgICB9KVxyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBudWxsXHJcbiAgICB9XHJcblxyXG4gICAgdmFyIE9GRlNFVCA9IHBhcnNlUGFyYW0oU19PRkZTRVQsIHRydWUpO1xyXG5cclxuICAgIGZ1bmN0aW9uIHBhcnNlVmVydENvdW50ICgpIHtcclxuICAgICAgaWYgKFNfQ09VTlQgaW4gc3RhdGljT3B0aW9ucykge1xyXG4gICAgICAgIHZhciBjb3VudCA9IHN0YXRpY09wdGlvbnNbU19DT1VOVF0gfCAwO1xyXG4gICAgICAgIGNoZWNrJDEuY29tbWFuZChcclxuICAgICAgICAgIHR5cGVvZiBjb3VudCA9PT0gJ251bWJlcicgJiYgY291bnQgPj0gMCwgJ2ludmFsaWQgdmVydGV4IGNvdW50JywgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgIHJldHVybiBjb3VudFxyXG4gICAgICAgIH0pXHJcbiAgICAgIH0gZWxzZSBpZiAoU19DT1VOVCBpbiBkeW5hbWljT3B0aW9ucykge1xyXG4gICAgICAgIHZhciBkeW5Db3VudCA9IGR5bmFtaWNPcHRpb25zW1NfQ09VTlRdO1xyXG4gICAgICAgIHJldHVybiBjcmVhdGVEeW5hbWljRGVjbChkeW5Db3VudCwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcclxuICAgICAgICAgIHZhciByZXN1bHQgPSBlbnYuaW52b2tlKHNjb3BlLCBkeW5Db3VudCk7XHJcbiAgICAgICAgICBjaGVjayQxLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcclxuICAgICAgICAgICAgICAndHlwZW9mICcgKyByZXN1bHQgKyAnPT09XCJudW1iZXJcIiYmJyArXHJcbiAgICAgICAgICAgICAgcmVzdWx0ICsgJz49MCYmJyArXHJcbiAgICAgICAgICAgICAgcmVzdWx0ICsgJz09PSgnICsgcmVzdWx0ICsgJ3wwKScsXHJcbiAgICAgICAgICAgICAgJ2ludmFsaWQgdmVydGV4IGNvdW50Jyk7XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICAgIHJldHVybiByZXN1bHRcclxuICAgICAgICB9KVxyXG4gICAgICB9IGVsc2UgaWYgKGVsZW1lbnRzKSB7XHJcbiAgICAgICAgaWYgKGlzU3RhdGljKGVsZW1lbnRzKSkge1xyXG4gICAgICAgICAgaWYgKGVsZW1lbnRzKSB7XHJcbiAgICAgICAgICAgIGlmIChPRkZTRVQpIHtcclxuICAgICAgICAgICAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxyXG4gICAgICAgICAgICAgICAgT0ZGU0VULnRoaXNEZXAsXHJcbiAgICAgICAgICAgICAgICBPRkZTRVQuY29udGV4dERlcCxcclxuICAgICAgICAgICAgICAgIE9GRlNFVC5wcm9wRGVwLFxyXG4gICAgICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcclxuICAgICAgICAgICAgICAgICAgdmFyIHJlc3VsdCA9IHNjb3BlLmRlZihcclxuICAgICAgICAgICAgICAgICAgICBlbnYuRUxFTUVOVFMsICcudmVydENvdW50LScsIGVudi5PRkZTRVQpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgY2hlY2skMS5vcHRpb25hbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcclxuICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdCArICc+PTAnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgdmVydGV4IG9mZnNldC9lbGVtZW50IGJ1ZmZlciB0b28gc21hbGwnKTtcclxuICAgICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0XHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKGVudi5FTEVNRU5UUywgJy52ZXJ0Q291bnQnKVxyXG4gICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHZhciByZXN1bHQgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICByZXR1cm4gLTFcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIGNoZWNrJDEub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgIHJlc3VsdC5NSVNTSU5HID0gdHJ1ZTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIHJldHVybiByZXN1bHRcclxuICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgdmFyIHZhcmlhYmxlID0gbmV3IERlY2xhcmF0aW9uKFxyXG4gICAgICAgICAgICBlbGVtZW50cy50aGlzRGVwIHx8IE9GRlNFVC50aGlzRGVwLFxyXG4gICAgICAgICAgICBlbGVtZW50cy5jb250ZXh0RGVwIHx8IE9GRlNFVC5jb250ZXh0RGVwLFxyXG4gICAgICAgICAgICBlbGVtZW50cy5wcm9wRGVwIHx8IE9GRlNFVC5wcm9wRGVwLFxyXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xyXG4gICAgICAgICAgICAgIHZhciBlbGVtZW50cyA9IGVudi5FTEVNRU5UUztcclxuICAgICAgICAgICAgICBpZiAoZW52Lk9GRlNFVCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihlbGVtZW50cywgJz8nLCBlbGVtZW50cywgJy52ZXJ0Q291bnQtJyxcclxuICAgICAgICAgICAgICAgICAgZW52Lk9GRlNFVCwgJzotMScpXHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoZWxlbWVudHMsICc/JywgZWxlbWVudHMsICcudmVydENvdW50Oi0xJylcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICBjaGVjayQxLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgdmFyaWFibGUuRFlOQU1JQyA9IHRydWU7XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICAgIHJldHVybiB2YXJpYWJsZVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gbnVsbFxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgIGVsZW1lbnRzOiBlbGVtZW50cyxcclxuICAgICAgcHJpbWl0aXZlOiBwYXJzZVByaW1pdGl2ZSgpLFxyXG4gICAgICBjb3VudDogcGFyc2VWZXJ0Q291bnQoKSxcclxuICAgICAgaW5zdGFuY2VzOiBwYXJzZVBhcmFtKFNfSU5TVEFOQ0VTLCBmYWxzZSksXHJcbiAgICAgIG9mZnNldDogT0ZGU0VUXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBwYXJzZUdMU3RhdGUgKG9wdGlvbnMsIGVudikge1xyXG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpYztcclxuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pYztcclxuXHJcbiAgICB2YXIgU1RBVEUgPSB7fTtcclxuXHJcbiAgICBHTF9TVEFURV9OQU1FUy5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XHJcbiAgICAgIHZhciBwYXJhbSA9IHByb3BOYW1lKHByb3ApO1xyXG5cclxuICAgICAgZnVuY3Rpb24gcGFyc2VQYXJhbSAocGFyc2VTdGF0aWMsIHBhcnNlRHluYW1pYykge1xyXG4gICAgICAgIGlmIChwcm9wIGluIHN0YXRpY09wdGlvbnMpIHtcclxuICAgICAgICAgIHZhciB2YWx1ZSA9IHBhcnNlU3RhdGljKHN0YXRpY09wdGlvbnNbcHJvcF0pO1xyXG4gICAgICAgICAgU1RBVEVbcGFyYW1dID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZVxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfSBlbHNlIGlmIChwcm9wIGluIGR5bmFtaWNPcHRpb25zKSB7XHJcbiAgICAgICAgICB2YXIgZHluID0gZHluYW1pY09wdGlvbnNbcHJvcF07XHJcbiAgICAgICAgICBTVEFURVtwYXJhbV0gPSBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBwYXJzZUR5bmFtaWMoZW52LCBzY29wZSwgZW52Lmludm9rZShzY29wZSwgZHluKSlcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgc3dpdGNoIChwcm9wKSB7XHJcbiAgICAgICAgY2FzZSBTX0NVTExfRU5BQkxFOlxyXG4gICAgICAgIGNhc2UgU19CTEVORF9FTkFCTEU6XHJcbiAgICAgICAgY2FzZSBTX0RJVEhFUjpcclxuICAgICAgICBjYXNlIFNfU1RFTkNJTF9FTkFCTEU6XHJcbiAgICAgICAgY2FzZSBTX0RFUFRIX0VOQUJMRTpcclxuICAgICAgICBjYXNlIFNfU0NJU1NPUl9FTkFCTEU6XHJcbiAgICAgICAgY2FzZSBTX1BPTFlHT05fT0ZGU0VUX0VOQUJMRTpcclxuICAgICAgICBjYXNlIFNfU0FNUExFX0FMUEhBOlxyXG4gICAgICAgIGNhc2UgU19TQU1QTEVfRU5BQkxFOlxyXG4gICAgICAgIGNhc2UgU19ERVBUSF9NQVNLOlxyXG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXHJcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZFR5cGUodmFsdWUsICdib29sZWFuJywgcHJvcCwgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcclxuICAgICAgICAgICAgICBjaGVjayQxLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXHJcbiAgICAgICAgICAgICAgICAgICd0eXBlb2YgJyArIHZhbHVlICsgJz09PVwiYm9vbGVhblwiJyxcclxuICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgZmxhZyAnICsgcHJvcCwgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZVxyXG4gICAgICAgICAgICB9KVxyXG5cclxuICAgICAgICBjYXNlIFNfREVQVEhfRlVOQzpcclxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxyXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcclxuICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmRQYXJhbWV0ZXIodmFsdWUsIGNvbXBhcmVGdW5jcywgJ2ludmFsaWQgJyArIHByb3AsIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgICByZXR1cm4gY29tcGFyZUZ1bmNzW3ZhbHVlXVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcclxuICAgICAgICAgICAgICB2YXIgQ09NUEFSRV9GVU5DUyA9IGVudi5jb25zdGFudHMuY29tcGFyZUZ1bmNzO1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcclxuICAgICAgICAgICAgICAgICAgdmFsdWUgKyAnIGluICcgKyBDT01QQVJFX0ZVTkNTLFxyXG4gICAgICAgICAgICAgICAgICAnaW52YWxpZCAnICsgcHJvcCArICcsIG11c3QgYmUgb25lIG9mICcgKyBPYmplY3Qua2V5cyhjb21wYXJlRnVuY3MpKTtcclxuICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKENPTVBBUkVfRlVOQ1MsICdbJywgdmFsdWUsICddJylcclxuICAgICAgICAgICAgfSlcclxuXHJcbiAgICAgICAgY2FzZSBTX0RFUFRIX1JBTkdFOlxyXG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXHJcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZChcclxuICAgICAgICAgICAgICAgIGlzQXJyYXlMaWtlKHZhbHVlKSAmJlxyXG4gICAgICAgICAgICAgICAgdmFsdWUubGVuZ3RoID09PSAyICYmXHJcbiAgICAgICAgICAgICAgICB0eXBlb2YgdmFsdWVbMF0gPT09ICdudW1iZXInICYmXHJcbiAgICAgICAgICAgICAgICB0eXBlb2YgdmFsdWVbMV0gPT09ICdudW1iZXInICYmXHJcbiAgICAgICAgICAgICAgICB2YWx1ZVswXSA8PSB2YWx1ZVsxXSxcclxuICAgICAgICAgICAgICAgICdkZXB0aCByYW5nZSBpcyAyZCBhcnJheScsXHJcbiAgICAgICAgICAgICAgICBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcclxuICAgICAgICAgICAgICAgICAgZW52LnNoYXJlZC5pc0FycmF5TGlrZSArICcoJyArIHZhbHVlICsgJykmJicgK1xyXG4gICAgICAgICAgICAgICAgICB2YWx1ZSArICcubGVuZ3RoPT09MiYmJyArXHJcbiAgICAgICAgICAgICAgICAgICd0eXBlb2YgJyArIHZhbHVlICsgJ1swXT09PVwibnVtYmVyXCImJicgK1xyXG4gICAgICAgICAgICAgICAgICAndHlwZW9mICcgKyB2YWx1ZSArICdbMV09PT1cIm51bWJlclwiJiYnICtcclxuICAgICAgICAgICAgICAgICAgdmFsdWUgKyAnWzBdPD0nICsgdmFsdWUgKyAnWzFdJyxcclxuICAgICAgICAgICAgICAgICAgJ2RlcHRoIHJhbmdlIG11c3QgYmUgYSAyZCBhcnJheScpO1xyXG4gICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICB2YXIgWl9ORUFSID0gc2NvcGUuZGVmKCcrJywgdmFsdWUsICdbMF0nKTtcclxuICAgICAgICAgICAgICB2YXIgWl9GQVIgPSBzY29wZS5kZWYoJysnLCB2YWx1ZSwgJ1sxXScpO1xyXG4gICAgICAgICAgICAgIHJldHVybiBbWl9ORUFSLCBaX0ZBUl1cclxuICAgICAgICAgICAgfSlcclxuXHJcbiAgICAgICAgY2FzZSBTX0JMRU5EX0ZVTkM6XHJcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcclxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kVHlwZSh2YWx1ZSwgJ29iamVjdCcsICdibGVuZC5mdW5jJywgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgIHZhciBzcmNSR0IgPSAoJ3NyY1JHQicgaW4gdmFsdWUgPyB2YWx1ZS5zcmNSR0IgOiB2YWx1ZS5zcmMpO1xyXG4gICAgICAgICAgICAgIHZhciBzcmNBbHBoYSA9ICgnc3JjQWxwaGEnIGluIHZhbHVlID8gdmFsdWUuc3JjQWxwaGEgOiB2YWx1ZS5zcmMpO1xyXG4gICAgICAgICAgICAgIHZhciBkc3RSR0IgPSAoJ2RzdFJHQicgaW4gdmFsdWUgPyB2YWx1ZS5kc3RSR0IgOiB2YWx1ZS5kc3QpO1xyXG4gICAgICAgICAgICAgIHZhciBkc3RBbHBoYSA9ICgnZHN0QWxwaGEnIGluIHZhbHVlID8gdmFsdWUuZHN0QWxwaGEgOiB2YWx1ZS5kc3QpO1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZFBhcmFtZXRlcihzcmNSR0IsIGJsZW5kRnVuY3MsIHBhcmFtICsgJy5zcmNSR0InLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kUGFyYW1ldGVyKHNyY0FscGhhLCBibGVuZEZ1bmNzLCBwYXJhbSArICcuc3JjQWxwaGEnLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kUGFyYW1ldGVyKGRzdFJHQiwgYmxlbmRGdW5jcywgcGFyYW0gKyAnLmRzdFJHQicsIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmRQYXJhbWV0ZXIoZHN0QWxwaGEsIGJsZW5kRnVuY3MsIHBhcmFtICsgJy5kc3RBbHBoYScsIGVudi5jb21tYW5kU3RyKTtcclxuXHJcbiAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kKFxyXG4gICAgICAgICAgICAgICAgKGludmFsaWRCbGVuZENvbWJpbmF0aW9ucy5pbmRleE9mKHNyY1JHQiArICcsICcgKyBkc3RSR0IpID09PSAtMSksXHJcbiAgICAgICAgICAgICAgICAndW5hbGxvd2VkIGJsZW5kaW5nIGNvbWJpbmF0aW9uIChzcmNSR0IsIGRzdFJHQikgPSAoJyArIHNyY1JHQiArICcsICcgKyBkc3RSR0IgKyAnKScsIGVudi5jb21tYW5kU3RyKTtcclxuXHJcbiAgICAgICAgICAgICAgcmV0dXJuIFtcclxuICAgICAgICAgICAgICAgIGJsZW5kRnVuY3Nbc3JjUkdCXSxcclxuICAgICAgICAgICAgICAgIGJsZW5kRnVuY3NbZHN0UkdCXSxcclxuICAgICAgICAgICAgICAgIGJsZW5kRnVuY3Nbc3JjQWxwaGFdLFxyXG4gICAgICAgICAgICAgICAgYmxlbmRGdW5jc1tkc3RBbHBoYV1cclxuICAgICAgICAgICAgICBdXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xyXG4gICAgICAgICAgICAgIHZhciBCTEVORF9GVU5DUyA9IGVudi5jb25zdGFudHMuYmxlbmRGdW5jcztcclxuXHJcbiAgICAgICAgICAgICAgY2hlY2skMS5vcHRpb25hbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxyXG4gICAgICAgICAgICAgICAgICB2YWx1ZSArICcmJnR5cGVvZiAnICsgdmFsdWUgKyAnPT09XCJvYmplY3RcIicsXHJcbiAgICAgICAgICAgICAgICAgICdpbnZhbGlkIGJsZW5kIGZ1bmMsIG11c3QgYmUgYW4gb2JqZWN0Jyk7XHJcbiAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgIGZ1bmN0aW9uIHJlYWQgKHByZWZpeCwgc3VmZml4KSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgZnVuYyA9IHNjb3BlLmRlZihcclxuICAgICAgICAgICAgICAgICAgJ1wiJywgcHJlZml4LCBzdWZmaXgsICdcIiBpbiAnLCB2YWx1ZSxcclxuICAgICAgICAgICAgICAgICAgJz8nLCB2YWx1ZSwgJy4nLCBwcmVmaXgsIHN1ZmZpeCxcclxuICAgICAgICAgICAgICAgICAgJzonLCB2YWx1ZSwgJy4nLCBwcmVmaXgpO1xyXG5cclxuICAgICAgICAgICAgICAgIGNoZWNrJDEub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxyXG4gICAgICAgICAgICAgICAgICAgIGZ1bmMgKyAnIGluICcgKyBCTEVORF9GVU5DUyxcclxuICAgICAgICAgICAgICAgICAgICAnaW52YWxpZCAnICsgcHJvcCArICcuJyArIHByZWZpeCArIHN1ZmZpeCArICcsIG11c3QgYmUgb25lIG9mICcgKyBPYmplY3Qua2V5cyhibGVuZEZ1bmNzKSk7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZnVuY1xyXG4gICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgdmFyIHNyY1JHQiA9IHJlYWQoJ3NyYycsICdSR0InKTtcclxuICAgICAgICAgICAgICB2YXIgZHN0UkdCID0gcmVhZCgnZHN0JywgJ1JHQicpO1xyXG5cclxuICAgICAgICAgICAgICBjaGVjayQxLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgIHZhciBJTlZBTElEX0JMRU5EX0NPTUJJTkFUSU9OUyA9IGVudi5jb25zdGFudHMuaW52YWxpZEJsZW5kQ29tYmluYXRpb25zO1xyXG5cclxuICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIElOVkFMSURfQkxFTkRfQ09NQklOQVRJT05TICtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgJy5pbmRleE9mKCcgKyBzcmNSR0IgKyAnK1wiLCBcIisnICsgZHN0UkdCICsgJykgPT09IC0xICcsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICd1bmFsbG93ZWQgYmxlbmRpbmcgY29tYmluYXRpb24gZm9yIChzcmNSR0IsIGRzdFJHQiknXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgICAgdmFyIFNSQ19SR0IgPSBzY29wZS5kZWYoQkxFTkRfRlVOQ1MsICdbJywgc3JjUkdCLCAnXScpO1xyXG4gICAgICAgICAgICAgIHZhciBTUkNfQUxQSEEgPSBzY29wZS5kZWYoQkxFTkRfRlVOQ1MsICdbJywgcmVhZCgnc3JjJywgJ0FscGhhJyksICddJyk7XHJcbiAgICAgICAgICAgICAgdmFyIERTVF9SR0IgPSBzY29wZS5kZWYoQkxFTkRfRlVOQ1MsICdbJywgZHN0UkdCLCAnXScpO1xyXG4gICAgICAgICAgICAgIHZhciBEU1RfQUxQSEEgPSBzY29wZS5kZWYoQkxFTkRfRlVOQ1MsICdbJywgcmVhZCgnZHN0JywgJ0FscGhhJyksICddJyk7XHJcblxyXG4gICAgICAgICAgICAgIHJldHVybiBbU1JDX1JHQiwgRFNUX1JHQiwgU1JDX0FMUEhBLCBEU1RfQUxQSEFdXHJcbiAgICAgICAgICAgIH0pXHJcblxyXG4gICAgICAgIGNhc2UgU19CTEVORF9FUVVBVElPTjpcclxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxyXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcclxuICAgICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xyXG4gICAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kUGFyYW1ldGVyKHZhbHVlLCBibGVuZEVxdWF0aW9ucywgJ2ludmFsaWQgJyArIHByb3AsIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBbXHJcbiAgICAgICAgICAgICAgICAgIGJsZW5kRXF1YXRpb25zW3ZhbHVlXSxcclxuICAgICAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWVdXHJcbiAgICAgICAgICAgICAgICBdXHJcbiAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XHJcbiAgICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmRQYXJhbWV0ZXIoXHJcbiAgICAgICAgICAgICAgICAgIHZhbHVlLnJnYiwgYmxlbmRFcXVhdGlvbnMsIHByb3AgKyAnLnJnYicsIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZFBhcmFtZXRlcihcclxuICAgICAgICAgICAgICAgICAgdmFsdWUuYWxwaGEsIGJsZW5kRXF1YXRpb25zLCBwcm9wICsgJy5hbHBoYScsIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBbXHJcbiAgICAgICAgICAgICAgICAgIGJsZW5kRXF1YXRpb25zW3ZhbHVlLnJnYl0sXHJcbiAgICAgICAgICAgICAgICAgIGJsZW5kRXF1YXRpb25zW3ZhbHVlLmFscGhhXVxyXG4gICAgICAgICAgICAgICAgXVxyXG4gICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmRSYWlzZSgnaW52YWxpZCBibGVuZC5lcXVhdGlvbicsIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xyXG4gICAgICAgICAgICAgIHZhciBCTEVORF9FUVVBVElPTlMgPSBlbnYuY29uc3RhbnRzLmJsZW5kRXF1YXRpb25zO1xyXG5cclxuICAgICAgICAgICAgICB2YXIgUkdCID0gc2NvcGUuZGVmKCk7XHJcbiAgICAgICAgICAgICAgdmFyIEFMUEhBID0gc2NvcGUuZGVmKCk7XHJcblxyXG4gICAgICAgICAgICAgIHZhciBpZnRlID0gZW52LmNvbmQoJ3R5cGVvZiAnLCB2YWx1ZSwgJz09PVwic3RyaW5nXCInKTtcclxuXHJcbiAgICAgICAgICAgICAgY2hlY2skMS5vcHRpb25hbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICBmdW5jdGlvbiBjaGVja1Byb3AgKGJsb2NrLCBuYW1lLCB2YWx1ZSkge1xyXG4gICAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KGJsb2NrLFxyXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlICsgJyBpbiAnICsgQkxFTkRfRVFVQVRJT05TLFxyXG4gICAgICAgICAgICAgICAgICAgICdpbnZhbGlkICcgKyBuYW1lICsgJywgbXVzdCBiZSBvbmUgb2YgJyArIE9iamVjdC5rZXlzKGJsZW5kRXF1YXRpb25zKSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBjaGVja1Byb3AoaWZ0ZS50aGVuLCBwcm9wLCB2YWx1ZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgZW52LmFzc2VydChpZnRlLmVsc2UsXHJcbiAgICAgICAgICAgICAgICAgIHZhbHVlICsgJyYmdHlwZW9mICcgKyB2YWx1ZSArICc9PT1cIm9iamVjdFwiJyxcclxuICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgJyArIHByb3ApO1xyXG4gICAgICAgICAgICAgICAgY2hlY2tQcm9wKGlmdGUuZWxzZSwgcHJvcCArICcucmdiJywgdmFsdWUgKyAnLnJnYicpO1xyXG4gICAgICAgICAgICAgICAgY2hlY2tQcm9wKGlmdGUuZWxzZSwgcHJvcCArICcuYWxwaGEnLCB2YWx1ZSArICcuYWxwaGEnKTtcclxuICAgICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgICAgaWZ0ZS50aGVuKFxyXG4gICAgICAgICAgICAgICAgUkdCLCAnPScsIEFMUEhBLCAnPScsIEJMRU5EX0VRVUFUSU9OUywgJ1snLCB2YWx1ZSwgJ107Jyk7XHJcbiAgICAgICAgICAgICAgaWZ0ZS5lbHNlKFxyXG4gICAgICAgICAgICAgICAgUkdCLCAnPScsIEJMRU5EX0VRVUFUSU9OUywgJ1snLCB2YWx1ZSwgJy5yZ2JdOycsXHJcbiAgICAgICAgICAgICAgICBBTFBIQSwgJz0nLCBCTEVORF9FUVVBVElPTlMsICdbJywgdmFsdWUsICcuYWxwaGFdOycpO1xyXG5cclxuICAgICAgICAgICAgICBzY29wZShpZnRlKTtcclxuXHJcbiAgICAgICAgICAgICAgcmV0dXJuIFtSR0IsIEFMUEhBXVxyXG4gICAgICAgICAgICB9KVxyXG5cclxuICAgICAgICBjYXNlIFNfQkxFTkRfQ09MT1I6XHJcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcclxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kKFxyXG4gICAgICAgICAgICAgICAgaXNBcnJheUxpa2UodmFsdWUpICYmXHJcbiAgICAgICAgICAgICAgICB2YWx1ZS5sZW5ndGggPT09IDQsXHJcbiAgICAgICAgICAgICAgICAnYmxlbmQuY29sb3IgbXVzdCBiZSBhIDRkIGFycmF5JywgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgIHJldHVybiBsb29wKDQsIGZ1bmN0aW9uIChpKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gK3ZhbHVlW2ldXHJcbiAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5vcHRpb25hbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxyXG4gICAgICAgICAgICAgICAgICBlbnYuc2hhcmVkLmlzQXJyYXlMaWtlICsgJygnICsgdmFsdWUgKyAnKSYmJyArXHJcbiAgICAgICAgICAgICAgICAgIHZhbHVlICsgJy5sZW5ndGg9PT00JyxcclxuICAgICAgICAgICAgICAgICAgJ2JsZW5kLmNvbG9yIG11c3QgYmUgYSA0ZCBhcnJheScpO1xyXG4gICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgIHJldHVybiBsb29wKDQsIGZ1bmN0aW9uIChpKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKCcrJywgdmFsdWUsICdbJywgaSwgJ10nKVxyXG4gICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIH0pXHJcblxyXG4gICAgICAgIGNhc2UgU19TVEVOQ0lMX01BU0s6XHJcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcclxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kVHlwZSh2YWx1ZSwgJ251bWJlcicsIHBhcmFtLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlIHwgMFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcclxuICAgICAgICAgICAgICBjaGVjayQxLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXHJcbiAgICAgICAgICAgICAgICAgICd0eXBlb2YgJyArIHZhbHVlICsgJz09PVwibnVtYmVyXCInLFxyXG4gICAgICAgICAgICAgICAgICAnaW52YWxpZCBzdGVuY2lsLm1hc2snKTtcclxuICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKHZhbHVlLCAnfDAnKVxyXG4gICAgICAgICAgICB9KVxyXG5cclxuICAgICAgICBjYXNlIFNfU1RFTkNJTF9GVU5DOlxyXG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXHJcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZFR5cGUodmFsdWUsICdvYmplY3QnLCBwYXJhbSwgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgIHZhciBjbXAgPSB2YWx1ZS5jbXAgfHwgJ2tlZXAnO1xyXG4gICAgICAgICAgICAgIHZhciByZWYgPSB2YWx1ZS5yZWYgfHwgMDtcclxuICAgICAgICAgICAgICB2YXIgbWFzayA9ICdtYXNrJyBpbiB2YWx1ZSA/IHZhbHVlLm1hc2sgOiAtMTtcclxuICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmRQYXJhbWV0ZXIoY21wLCBjb21wYXJlRnVuY3MsIHByb3AgKyAnLmNtcCcsIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmRUeXBlKHJlZiwgJ251bWJlcicsIHByb3AgKyAnLnJlZicsIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmRUeXBlKG1hc2ssICdudW1iZXInLCBwcm9wICsgJy5tYXNrJywgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgIHJldHVybiBbXHJcbiAgICAgICAgICAgICAgICBjb21wYXJlRnVuY3NbY21wXSxcclxuICAgICAgICAgICAgICAgIHJlZixcclxuICAgICAgICAgICAgICAgIG1hc2tcclxuICAgICAgICAgICAgICBdXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xyXG4gICAgICAgICAgICAgIHZhciBDT01QQVJFX0ZVTkNTID0gZW52LmNvbnN0YW50cy5jb21wYXJlRnVuY3M7XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5vcHRpb25hbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICBmdW5jdGlvbiBhc3NlcnQgKCkge1xyXG4gICAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxyXG4gICAgICAgICAgICAgICAgICAgIEFycmF5LnByb3RvdHlwZS5qb2luLmNhbGwoYXJndW1lbnRzLCAnJyksXHJcbiAgICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgc3RlbmNpbC5mdW5jJyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBhc3NlcnQodmFsdWUgKyAnJiZ0eXBlb2YgJywgdmFsdWUsICc9PT1cIm9iamVjdFwiJyk7XHJcbiAgICAgICAgICAgICAgICBhc3NlcnQoJyEoXCJjbXBcIiBpbiAnLCB2YWx1ZSwgJyl8fCgnLFxyXG4gICAgICAgICAgICAgICAgICB2YWx1ZSwgJy5jbXAgaW4gJywgQ09NUEFSRV9GVU5DUywgJyknKTtcclxuICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICB2YXIgY21wID0gc2NvcGUuZGVmKFxyXG4gICAgICAgICAgICAgICAgJ1wiY21wXCIgaW4gJywgdmFsdWUsXHJcbiAgICAgICAgICAgICAgICAnPycsIENPTVBBUkVfRlVOQ1MsICdbJywgdmFsdWUsICcuY21wXScsXHJcbiAgICAgICAgICAgICAgICAnOicsIEdMX0tFRVApO1xyXG4gICAgICAgICAgICAgIHZhciByZWYgPSBzY29wZS5kZWYodmFsdWUsICcucmVmfDAnKTtcclxuICAgICAgICAgICAgICB2YXIgbWFzayA9IHNjb3BlLmRlZihcclxuICAgICAgICAgICAgICAgICdcIm1hc2tcIiBpbiAnLCB2YWx1ZSxcclxuICAgICAgICAgICAgICAgICc/JywgdmFsdWUsICcubWFza3wwOi0xJyk7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIFtjbXAsIHJlZiwgbWFza11cclxuICAgICAgICAgICAgfSlcclxuXHJcbiAgICAgICAgY2FzZSBTX1NURU5DSUxfT1BGUk9OVDpcclxuICAgICAgICBjYXNlIFNfU1RFTkNJTF9PUEJBQ0s6XHJcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcclxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kVHlwZSh2YWx1ZSwgJ29iamVjdCcsIHBhcmFtLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgICAgdmFyIGZhaWwgPSB2YWx1ZS5mYWlsIHx8ICdrZWVwJztcclxuICAgICAgICAgICAgICB2YXIgemZhaWwgPSB2YWx1ZS56ZmFpbCB8fCAna2VlcCc7XHJcbiAgICAgICAgICAgICAgdmFyIHpwYXNzID0gdmFsdWUuenBhc3MgfHwgJ2tlZXAnO1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZFBhcmFtZXRlcihmYWlsLCBzdGVuY2lsT3BzLCBwcm9wICsgJy5mYWlsJywgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZFBhcmFtZXRlcih6ZmFpbCwgc3RlbmNpbE9wcywgcHJvcCArICcuemZhaWwnLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kUGFyYW1ldGVyKHpwYXNzLCBzdGVuY2lsT3BzLCBwcm9wICsgJy56cGFzcycsIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgICByZXR1cm4gW1xyXG4gICAgICAgICAgICAgICAgcHJvcCA9PT0gU19TVEVOQ0lMX09QQkFDSyA/IEdMX0JBQ0sgOiBHTF9GUk9OVCxcclxuICAgICAgICAgICAgICAgIHN0ZW5jaWxPcHNbZmFpbF0sXHJcbiAgICAgICAgICAgICAgICBzdGVuY2lsT3BzW3pmYWlsXSxcclxuICAgICAgICAgICAgICAgIHN0ZW5jaWxPcHNbenBhc3NdXHJcbiAgICAgICAgICAgICAgXVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcclxuICAgICAgICAgICAgICB2YXIgU1RFTkNJTF9PUFMgPSBlbnYuY29uc3RhbnRzLnN0ZW5jaWxPcHM7XHJcblxyXG4gICAgICAgICAgICAgIGNoZWNrJDEub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcclxuICAgICAgICAgICAgICAgICAgdmFsdWUgKyAnJiZ0eXBlb2YgJyArIHZhbHVlICsgJz09PVwib2JqZWN0XCInLFxyXG4gICAgICAgICAgICAgICAgICAnaW52YWxpZCAnICsgcHJvcCk7XHJcbiAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgIGZ1bmN0aW9uIHJlYWQgKG5hbWUpIHtcclxuICAgICAgICAgICAgICAgIGNoZWNrJDEub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxyXG4gICAgICAgICAgICAgICAgICAgICchKFwiJyArIG5hbWUgKyAnXCIgaW4gJyArIHZhbHVlICsgJyl8fCcgK1xyXG4gICAgICAgICAgICAgICAgICAgICcoJyArIHZhbHVlICsgJy4nICsgbmFtZSArICcgaW4gJyArIFNURU5DSUxfT1BTICsgJyknLFxyXG4gICAgICAgICAgICAgICAgICAgICdpbnZhbGlkICcgKyBwcm9wICsgJy4nICsgbmFtZSArICcsIG11c3QgYmUgb25lIG9mICcgKyBPYmplY3Qua2V5cyhzdGVuY2lsT3BzKSk7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKFxyXG4gICAgICAgICAgICAgICAgICAnXCInLCBuYW1lLCAnXCIgaW4gJywgdmFsdWUsXHJcbiAgICAgICAgICAgICAgICAgICc/JywgU1RFTkNJTF9PUFMsICdbJywgdmFsdWUsICcuJywgbmFtZSwgJ106JyxcclxuICAgICAgICAgICAgICAgICAgR0xfS0VFUClcclxuICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgIHJldHVybiBbXHJcbiAgICAgICAgICAgICAgICBwcm9wID09PSBTX1NURU5DSUxfT1BCQUNLID8gR0xfQkFDSyA6IEdMX0ZST05ULFxyXG4gICAgICAgICAgICAgICAgcmVhZCgnZmFpbCcpLFxyXG4gICAgICAgICAgICAgICAgcmVhZCgnemZhaWwnKSxcclxuICAgICAgICAgICAgICAgIHJlYWQoJ3pwYXNzJylcclxuICAgICAgICAgICAgICBdXHJcbiAgICAgICAgICAgIH0pXHJcblxyXG4gICAgICAgIGNhc2UgU19QT0xZR09OX09GRlNFVF9PRkZTRVQ6XHJcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcclxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kVHlwZSh2YWx1ZSwgJ29iamVjdCcsIHBhcmFtLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgICAgdmFyIGZhY3RvciA9IHZhbHVlLmZhY3RvciB8IDA7XHJcbiAgICAgICAgICAgICAgdmFyIHVuaXRzID0gdmFsdWUudW5pdHMgfCAwO1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZFR5cGUoZmFjdG9yLCAnbnVtYmVyJywgcGFyYW0gKyAnLmZhY3RvcicsIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmRUeXBlKHVuaXRzLCAnbnVtYmVyJywgcGFyYW0gKyAnLnVuaXRzJywgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgIHJldHVybiBbZmFjdG9yLCB1bml0c11cclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5vcHRpb25hbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxyXG4gICAgICAgICAgICAgICAgICB2YWx1ZSArICcmJnR5cGVvZiAnICsgdmFsdWUgKyAnPT09XCJvYmplY3RcIicsXHJcbiAgICAgICAgICAgICAgICAgICdpbnZhbGlkICcgKyBwcm9wKTtcclxuICAgICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgICAgdmFyIEZBQ1RPUiA9IHNjb3BlLmRlZih2YWx1ZSwgJy5mYWN0b3J8MCcpO1xyXG4gICAgICAgICAgICAgIHZhciBVTklUUyA9IHNjb3BlLmRlZih2YWx1ZSwgJy51bml0c3wwJyk7XHJcblxyXG4gICAgICAgICAgICAgIHJldHVybiBbRkFDVE9SLCBVTklUU11cclxuICAgICAgICAgICAgfSlcclxuXHJcbiAgICAgICAgY2FzZSBTX0NVTExfRkFDRTpcclxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxyXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcclxuICAgICAgICAgICAgICB2YXIgZmFjZSA9IDA7XHJcbiAgICAgICAgICAgICAgaWYgKHZhbHVlID09PSAnZnJvbnQnKSB7XHJcbiAgICAgICAgICAgICAgICBmYWNlID0gR0xfRlJPTlQ7XHJcbiAgICAgICAgICAgICAgfSBlbHNlIGlmICh2YWx1ZSA9PT0gJ2JhY2snKSB7XHJcbiAgICAgICAgICAgICAgICBmYWNlID0gR0xfQkFDSztcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kKCEhZmFjZSwgcGFyYW0sIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgICByZXR1cm4gZmFjZVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcclxuICAgICAgICAgICAgICBjaGVjayQxLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXHJcbiAgICAgICAgICAgICAgICAgIHZhbHVlICsgJz09PVwiZnJvbnRcInx8JyArXHJcbiAgICAgICAgICAgICAgICAgIHZhbHVlICsgJz09PVwiYmFja1wiJyxcclxuICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgY3VsbC5mYWNlJyk7XHJcbiAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZih2YWx1ZSwgJz09PVwiZnJvbnRcIj8nLCBHTF9GUk9OVCwgJzonLCBHTF9CQUNLKVxyXG4gICAgICAgICAgICB9KVxyXG5cclxuICAgICAgICBjYXNlIFNfTElORV9XSURUSDpcclxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxyXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcclxuICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmQoXHJcbiAgICAgICAgICAgICAgICB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInICYmXHJcbiAgICAgICAgICAgICAgICB2YWx1ZSA+PSBsaW1pdHMubGluZVdpZHRoRGltc1swXSAmJlxyXG4gICAgICAgICAgICAgICAgdmFsdWUgPD0gbGltaXRzLmxpbmVXaWR0aERpbXNbMV0sXHJcbiAgICAgICAgICAgICAgICAnaW52YWxpZCBsaW5lIHdpZHRoLCBtdXN0IGJlIGEgcG9zaXRpdmUgbnVtYmVyIGJldHdlZW4gJyArXHJcbiAgICAgICAgICAgICAgICBsaW1pdHMubGluZVdpZHRoRGltc1swXSArICcgYW5kICcgKyBsaW1pdHMubGluZVdpZHRoRGltc1sxXSwgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcclxuICAgICAgICAgICAgICBjaGVjayQxLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXHJcbiAgICAgICAgICAgICAgICAgICd0eXBlb2YgJyArIHZhbHVlICsgJz09PVwibnVtYmVyXCImJicgK1xyXG4gICAgICAgICAgICAgICAgICB2YWx1ZSArICc+PScgKyBsaW1pdHMubGluZVdpZHRoRGltc1swXSArICcmJicgK1xyXG4gICAgICAgICAgICAgICAgICB2YWx1ZSArICc8PScgKyBsaW1pdHMubGluZVdpZHRoRGltc1sxXSxcclxuICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgbGluZSB3aWR0aCcpO1xyXG4gICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWVcclxuICAgICAgICAgICAgfSlcclxuXHJcbiAgICAgICAgY2FzZSBTX0ZST05UX0ZBQ0U6XHJcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcclxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kUGFyYW1ldGVyKHZhbHVlLCBvcmllbnRhdGlvblR5cGUsIHBhcmFtLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIG9yaWVudGF0aW9uVHlwZVt2YWx1ZV1cclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5vcHRpb25hbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxyXG4gICAgICAgICAgICAgICAgICB2YWx1ZSArICc9PT1cImN3XCJ8fCcgK1xyXG4gICAgICAgICAgICAgICAgICB2YWx1ZSArICc9PT1cImNjd1wiJyxcclxuICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgZnJvbnRGYWNlLCBtdXN0IGJlIG9uZSBvZiBjdyxjY3cnKTtcclxuICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKHZhbHVlICsgJz09PVwiY3dcIj8nICsgR0xfQ1cgKyAnOicgKyBHTF9DQ1cpXHJcbiAgICAgICAgICAgIH0pXHJcblxyXG4gICAgICAgIGNhc2UgU19DT0xPUl9NQVNLOlxyXG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXHJcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZChcclxuICAgICAgICAgICAgICAgIGlzQXJyYXlMaWtlKHZhbHVlKSAmJiB2YWx1ZS5sZW5ndGggPT09IDQsXHJcbiAgICAgICAgICAgICAgICAnY29sb3IubWFzayBtdXN0IGJlIGxlbmd0aCA0IGFycmF5JywgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZS5tYXAoZnVuY3Rpb24gKHYpIHsgcmV0dXJuICEhdiB9KVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcclxuICAgICAgICAgICAgICBjaGVjayQxLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXHJcbiAgICAgICAgICAgICAgICAgIGVudi5zaGFyZWQuaXNBcnJheUxpa2UgKyAnKCcgKyB2YWx1ZSArICcpJiYnICtcclxuICAgICAgICAgICAgICAgICAgdmFsdWUgKyAnLmxlbmd0aD09PTQnLFxyXG4gICAgICAgICAgICAgICAgICAnaW52YWxpZCBjb2xvci5tYXNrJyk7XHJcbiAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIGxvb3AoNCwgZnVuY3Rpb24gKGkpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiAnISEnICsgdmFsdWUgKyAnWycgKyBpICsgJ10nXHJcbiAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgfSlcclxuXHJcbiAgICAgICAgY2FzZSBTX1NBTVBMRV9DT1ZFUkFHRTpcclxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxyXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcclxuICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmQodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSwgcGFyYW0sIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgICB2YXIgc2FtcGxlVmFsdWUgPSAndmFsdWUnIGluIHZhbHVlID8gdmFsdWUudmFsdWUgOiAxO1xyXG4gICAgICAgICAgICAgIHZhciBzYW1wbGVJbnZlcnQgPSAhIXZhbHVlLmludmVydDtcclxuICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmQoXHJcbiAgICAgICAgICAgICAgICB0eXBlb2Ygc2FtcGxlVmFsdWUgPT09ICdudW1iZXInICYmXHJcbiAgICAgICAgICAgICAgICBzYW1wbGVWYWx1ZSA+PSAwICYmIHNhbXBsZVZhbHVlIDw9IDEsXHJcbiAgICAgICAgICAgICAgICAnc2FtcGxlLmNvdmVyYWdlLnZhbHVlIG11c3QgYmUgYSBudW1iZXIgYmV0d2VlbiAwIGFuZCAxJywgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgIHJldHVybiBbc2FtcGxlVmFsdWUsIHNhbXBsZUludmVydF1cclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5vcHRpb25hbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxyXG4gICAgICAgICAgICAgICAgICB2YWx1ZSArICcmJnR5cGVvZiAnICsgdmFsdWUgKyAnPT09XCJvYmplY3RcIicsXHJcbiAgICAgICAgICAgICAgICAgICdpbnZhbGlkIHNhbXBsZS5jb3ZlcmFnZScpO1xyXG4gICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgIHZhciBWQUxVRSA9IHNjb3BlLmRlZihcclxuICAgICAgICAgICAgICAgICdcInZhbHVlXCIgaW4gJywgdmFsdWUsICc/KycsIHZhbHVlLCAnLnZhbHVlOjEnKTtcclxuICAgICAgICAgICAgICB2YXIgSU5WRVJUID0gc2NvcGUuZGVmKCchIScsIHZhbHVlLCAnLmludmVydCcpO1xyXG4gICAgICAgICAgICAgIHJldHVybiBbVkFMVUUsIElOVkVSVF1cclxuICAgICAgICAgICAgfSlcclxuICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIFNUQVRFXHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBwYXJzZVVuaWZvcm1zICh1bmlmb3JtcywgZW52KSB7XHJcbiAgICB2YXIgc3RhdGljVW5pZm9ybXMgPSB1bmlmb3Jtcy5zdGF0aWM7XHJcbiAgICB2YXIgZHluYW1pY1VuaWZvcm1zID0gdW5pZm9ybXMuZHluYW1pYztcclxuXHJcbiAgICB2YXIgVU5JRk9STVMgPSB7fTtcclxuXHJcbiAgICBPYmplY3Qua2V5cyhzdGF0aWNVbmlmb3JtcykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xyXG4gICAgICB2YXIgdmFsdWUgPSBzdGF0aWNVbmlmb3Jtc1tuYW1lXTtcclxuICAgICAgdmFyIHJlc3VsdDtcclxuICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgfHxcclxuICAgICAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XHJcbiAgICAgICAgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICByZXR1cm4gdmFsdWVcclxuICAgICAgICB9KTtcclxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICB2YXIgcmVnbFR5cGUgPSB2YWx1ZS5fcmVnbFR5cGU7XHJcbiAgICAgICAgaWYgKHJlZ2xUeXBlID09PSAndGV4dHVyZTJkJyB8fFxyXG4gICAgICAgICAgICByZWdsVHlwZSA9PT0gJ3RleHR1cmVDdWJlJykge1xyXG4gICAgICAgICAgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52KSB7XHJcbiAgICAgICAgICAgIHJldHVybiBlbnYubGluayh2YWx1ZSlcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0gZWxzZSBpZiAocmVnbFR5cGUgPT09ICdmcmFtZWJ1ZmZlcicgfHxcclxuICAgICAgICAgICAgICAgICAgIHJlZ2xUeXBlID09PSAnZnJhbWVidWZmZXJDdWJlJykge1xyXG4gICAgICAgICAgY2hlY2skMS5jb21tYW5kKHZhbHVlLmNvbG9yLmxlbmd0aCA+IDAsXHJcbiAgICAgICAgICAgICdtaXNzaW5nIGNvbG9yIGF0dGFjaG1lbnQgZm9yIGZyYW1lYnVmZmVyIHNlbnQgdG8gdW5pZm9ybSBcIicgKyBuYW1lICsgJ1wiJywgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52KSB7XHJcbiAgICAgICAgICAgIHJldHVybiBlbnYubGluayh2YWx1ZS5jb2xvclswXSlcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBjaGVjayQxLmNvbW1hbmRSYWlzZSgnaW52YWxpZCBkYXRhIGZvciB1bmlmb3JtIFwiJyArIG5hbWUgKyAnXCInLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2UgaWYgKGlzQXJyYXlMaWtlKHZhbHVlKSkge1xyXG4gICAgICAgIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudikge1xyXG4gICAgICAgICAgdmFyIElURU0gPSBlbnYuZ2xvYmFsLmRlZignWycsXHJcbiAgICAgICAgICAgIGxvb3AodmFsdWUubGVuZ3RoLCBmdW5jdGlvbiAoaSkge1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZChcclxuICAgICAgICAgICAgICAgIHR5cGVvZiB2YWx1ZVtpXSA9PT0gJ251bWJlcicgfHxcclxuICAgICAgICAgICAgICAgIHR5cGVvZiB2YWx1ZVtpXSA9PT0gJ2Jvb2xlYW4nLFxyXG4gICAgICAgICAgICAgICAgJ2ludmFsaWQgdW5pZm9ybSAnICsgbmFtZSwgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZVtpXVxyXG4gICAgICAgICAgICB9KSwgJ10nKTtcclxuICAgICAgICAgIHJldHVybiBJVEVNXHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgY2hlY2skMS5jb21tYW5kUmFpc2UoJ2ludmFsaWQgb3IgbWlzc2luZyBkYXRhIGZvciB1bmlmb3JtIFwiJyArIG5hbWUgKyAnXCInLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgIH1cclxuICAgICAgcmVzdWx0LnZhbHVlID0gdmFsdWU7XHJcbiAgICAgIFVOSUZPUk1TW25hbWVdID0gcmVzdWx0O1xyXG4gICAgfSk7XHJcblxyXG4gICAgT2JqZWN0LmtleXMoZHluYW1pY1VuaWZvcm1zKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcclxuICAgICAgdmFyIGR5biA9IGR5bmFtaWNVbmlmb3Jtc1trZXldO1xyXG4gICAgICBVTklGT1JNU1trZXldID0gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xyXG4gICAgICAgIHJldHVybiBlbnYuaW52b2tlKHNjb3BlLCBkeW4pXHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIFVOSUZPUk1TXHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBwYXJzZUF0dHJpYnV0ZXMgKGF0dHJpYnV0ZXMsIGVudikge1xyXG4gICAgdmFyIHN0YXRpY0F0dHJpYnV0ZXMgPSBhdHRyaWJ1dGVzLnN0YXRpYztcclxuICAgIHZhciBkeW5hbWljQXR0cmlidXRlcyA9IGF0dHJpYnV0ZXMuZHluYW1pYztcclxuXHJcbiAgICB2YXIgYXR0cmlidXRlRGVmcyA9IHt9O1xyXG5cclxuICAgIE9iamVjdC5rZXlzKHN0YXRpY0F0dHJpYnV0ZXMpLmZvckVhY2goZnVuY3Rpb24gKGF0dHJpYnV0ZSkge1xyXG4gICAgICB2YXIgdmFsdWUgPSBzdGF0aWNBdHRyaWJ1dGVzW2F0dHJpYnV0ZV07XHJcbiAgICAgIHZhciBpZCA9IHN0cmluZ1N0b3JlLmlkKGF0dHJpYnV0ZSk7XHJcblxyXG4gICAgICB2YXIgcmVjb3JkID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpO1xyXG4gICAgICBpZiAoaXNCdWZmZXJBcmdzKHZhbHVlKSkge1xyXG4gICAgICAgIHJlY29yZC5zdGF0ZSA9IEFUVFJJQl9TVEFURV9QT0lOVEVSO1xyXG4gICAgICAgIHJlY29yZC5idWZmZXIgPSBidWZmZXJTdGF0ZS5nZXRCdWZmZXIoXHJcbiAgICAgICAgICBidWZmZXJTdGF0ZS5jcmVhdGUodmFsdWUsIEdMX0FSUkFZX0JVRkZFUiQxLCBmYWxzZSwgdHJ1ZSkpO1xyXG4gICAgICAgIHJlY29yZC50eXBlID0gMDtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB2YXIgYnVmZmVyID0gYnVmZmVyU3RhdGUuZ2V0QnVmZmVyKHZhbHVlKTtcclxuICAgICAgICBpZiAoYnVmZmVyKSB7XHJcbiAgICAgICAgICByZWNvcmQuc3RhdGUgPSBBVFRSSUJfU1RBVEVfUE9JTlRFUjtcclxuICAgICAgICAgIHJlY29yZC5idWZmZXIgPSBidWZmZXI7XHJcbiAgICAgICAgICByZWNvcmQudHlwZSA9IDA7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGNoZWNrJDEuY29tbWFuZCh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlLFxyXG4gICAgICAgICAgICAnaW52YWxpZCBkYXRhIGZvciBhdHRyaWJ1dGUgJyArIGF0dHJpYnV0ZSwgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgaWYgKCdjb25zdGFudCcgaW4gdmFsdWUpIHtcclxuICAgICAgICAgICAgdmFyIGNvbnN0YW50ID0gdmFsdWUuY29uc3RhbnQ7XHJcbiAgICAgICAgICAgIHJlY29yZC5idWZmZXIgPSAnbnVsbCc7XHJcbiAgICAgICAgICAgIHJlY29yZC5zdGF0ZSA9IEFUVFJJQl9TVEFURV9DT05TVEFOVDtcclxuICAgICAgICAgICAgaWYgKHR5cGVvZiBjb25zdGFudCA9PT0gJ251bWJlcicpIHtcclxuICAgICAgICAgICAgICByZWNvcmQueCA9IGNvbnN0YW50O1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZChcclxuICAgICAgICAgICAgICAgIGlzQXJyYXlMaWtlKGNvbnN0YW50KSAmJlxyXG4gICAgICAgICAgICAgICAgY29uc3RhbnQubGVuZ3RoID4gMCAmJlxyXG4gICAgICAgICAgICAgICAgY29uc3RhbnQubGVuZ3RoIDw9IDQsXHJcbiAgICAgICAgICAgICAgICAnaW52YWxpZCBjb25zdGFudCBmb3IgYXR0cmlidXRlICcgKyBhdHRyaWJ1dGUsIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgICBDVVRFX0NPTVBPTkVOVFMuZm9yRWFjaChmdW5jdGlvbiAoYywgaSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKGkgPCBjb25zdGFudC5sZW5ndGgpIHtcclxuICAgICAgICAgICAgICAgICAgcmVjb3JkW2NdID0gY29uc3RhbnRbaV07XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGlmIChpc0J1ZmZlckFyZ3ModmFsdWUuYnVmZmVyKSkge1xyXG4gICAgICAgICAgICAgIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcihcclxuICAgICAgICAgICAgICAgIGJ1ZmZlclN0YXRlLmNyZWF0ZSh2YWx1ZS5idWZmZXIsIEdMX0FSUkFZX0JVRkZFUiQxLCBmYWxzZSwgdHJ1ZSkpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcih2YWx1ZS5idWZmZXIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZCghIWJ1ZmZlciwgJ21pc3NpbmcgYnVmZmVyIGZvciBhdHRyaWJ1dGUgXCInICsgYXR0cmlidXRlICsgJ1wiJywgZW52LmNvbW1hbmRTdHIpO1xyXG5cclxuICAgICAgICAgICAgdmFyIG9mZnNldCA9IHZhbHVlLm9mZnNldCB8IDA7XHJcbiAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZChvZmZzZXQgPj0gMCxcclxuICAgICAgICAgICAgICAnaW52YWxpZCBvZmZzZXQgZm9yIGF0dHJpYnV0ZSBcIicgKyBhdHRyaWJ1dGUgKyAnXCInLCBlbnYuY29tbWFuZFN0cik7XHJcblxyXG4gICAgICAgICAgICB2YXIgc3RyaWRlID0gdmFsdWUuc3RyaWRlIHwgMDtcclxuICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kKHN0cmlkZSA+PSAwICYmIHN0cmlkZSA8IDI1NixcclxuICAgICAgICAgICAgICAnaW52YWxpZCBzdHJpZGUgZm9yIGF0dHJpYnV0ZSBcIicgKyBhdHRyaWJ1dGUgKyAnXCIsIG11c3QgYmUgaW50ZWdlciBiZXR3ZWVlbiBbMCwgMjU1XScsIGVudi5jb21tYW5kU3RyKTtcclxuXHJcbiAgICAgICAgICAgIHZhciBzaXplID0gdmFsdWUuc2l6ZSB8IDA7XHJcbiAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZCghKCdzaXplJyBpbiB2YWx1ZSkgfHwgKHNpemUgPiAwICYmIHNpemUgPD0gNCksXHJcbiAgICAgICAgICAgICAgJ2ludmFsaWQgc2l6ZSBmb3IgYXR0cmlidXRlIFwiJyArIGF0dHJpYnV0ZSArICdcIiwgbXVzdCBiZSAxLDIsMyw0JywgZW52LmNvbW1hbmRTdHIpO1xyXG5cclxuICAgICAgICAgICAgdmFyIG5vcm1hbGl6ZWQgPSAhIXZhbHVlLm5vcm1hbGl6ZWQ7XHJcblxyXG4gICAgICAgICAgICB2YXIgdHlwZSA9IDA7XHJcbiAgICAgICAgICAgIGlmICgndHlwZScgaW4gdmFsdWUpIHtcclxuICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmRQYXJhbWV0ZXIoXHJcbiAgICAgICAgICAgICAgICB2YWx1ZS50eXBlLCBnbFR5cGVzLFxyXG4gICAgICAgICAgICAgICAgJ2ludmFsaWQgdHlwZSBmb3IgYXR0cmlidXRlICcgKyBhdHRyaWJ1dGUsIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgICB0eXBlID0gZ2xUeXBlc1t2YWx1ZS50eXBlXTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgdmFyIGRpdmlzb3IgPSB2YWx1ZS5kaXZpc29yIHwgMDtcclxuICAgICAgICAgICAgaWYgKCdkaXZpc29yJyBpbiB2YWx1ZSkge1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZChkaXZpc29yID09PSAwIHx8IGV4dEluc3RhbmNpbmcsXHJcbiAgICAgICAgICAgICAgICAnY2Fubm90IHNwZWNpZnkgZGl2aXNvciBmb3IgYXR0cmlidXRlIFwiJyArIGF0dHJpYnV0ZSArICdcIiwgaW5zdGFuY2luZyBub3Qgc3VwcG9ydGVkJywgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZChkaXZpc29yID49IDAsXHJcbiAgICAgICAgICAgICAgICAnaW52YWxpZCBkaXZpc29yIGZvciBhdHRyaWJ1dGUgXCInICsgYXR0cmlidXRlICsgJ1wiJywgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBjaGVjayQxLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICB2YXIgY29tbWFuZCA9IGVudi5jb21tYW5kU3RyO1xyXG5cclxuICAgICAgICAgICAgICB2YXIgVkFMSURfS0VZUyA9IFtcclxuICAgICAgICAgICAgICAgICdidWZmZXInLFxyXG4gICAgICAgICAgICAgICAgJ29mZnNldCcsXHJcbiAgICAgICAgICAgICAgICAnZGl2aXNvcicsXHJcbiAgICAgICAgICAgICAgICAnbm9ybWFsaXplZCcsXHJcbiAgICAgICAgICAgICAgICAndHlwZScsXHJcbiAgICAgICAgICAgICAgICAnc2l6ZScsXHJcbiAgICAgICAgICAgICAgICAnc3RyaWRlJ1xyXG4gICAgICAgICAgICAgIF07XHJcblxyXG4gICAgICAgICAgICAgIE9iamVjdC5rZXlzKHZhbHVlKS5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XHJcbiAgICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmQoXHJcbiAgICAgICAgICAgICAgICAgIFZBTElEX0tFWVMuaW5kZXhPZihwcm9wKSA+PSAwLFxyXG4gICAgICAgICAgICAgICAgICAndW5rbm93biBwYXJhbWV0ZXIgXCInICsgcHJvcCArICdcIiBmb3IgYXR0cmlidXRlIHBvaW50ZXIgXCInICsgYXR0cmlidXRlICsgJ1wiICh2YWxpZCBwYXJhbWV0ZXJzIGFyZSAnICsgVkFMSURfS0VZUyArICcpJyxcclxuICAgICAgICAgICAgICAgICAgY29tbWFuZCk7XHJcbiAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgcmVjb3JkLmJ1ZmZlciA9IGJ1ZmZlcjtcclxuICAgICAgICAgICAgcmVjb3JkLnN0YXRlID0gQVRUUklCX1NUQVRFX1BPSU5URVI7XHJcbiAgICAgICAgICAgIHJlY29yZC5zaXplID0gc2l6ZTtcclxuICAgICAgICAgICAgcmVjb3JkLm5vcm1hbGl6ZWQgPSBub3JtYWxpemVkO1xyXG4gICAgICAgICAgICByZWNvcmQudHlwZSA9IHR5cGUgfHwgYnVmZmVyLmR0eXBlO1xyXG4gICAgICAgICAgICByZWNvcmQub2Zmc2V0ID0gb2Zmc2V0O1xyXG4gICAgICAgICAgICByZWNvcmQuc3RyaWRlID0gc3RyaWRlO1xyXG4gICAgICAgICAgICByZWNvcmQuZGl2aXNvciA9IGRpdmlzb3I7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICBhdHRyaWJ1dGVEZWZzW2F0dHJpYnV0ZV0gPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XHJcbiAgICAgICAgdmFyIGNhY2hlID0gZW52LmF0dHJpYkNhY2hlO1xyXG4gICAgICAgIGlmIChpZCBpbiBjYWNoZSkge1xyXG4gICAgICAgICAgcmV0dXJuIGNhY2hlW2lkXVxyXG4gICAgICAgIH1cclxuICAgICAgICB2YXIgcmVzdWx0ID0ge1xyXG4gICAgICAgICAgaXNTdHJlYW06IGZhbHNlXHJcbiAgICAgICAgfTtcclxuICAgICAgICBPYmplY3Qua2V5cyhyZWNvcmQpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xyXG4gICAgICAgICAgcmVzdWx0W2tleV0gPSByZWNvcmRba2V5XTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBpZiAocmVjb3JkLmJ1ZmZlcikge1xyXG4gICAgICAgICAgcmVzdWx0LmJ1ZmZlciA9IGVudi5saW5rKHJlY29yZC5idWZmZXIpO1xyXG4gICAgICAgICAgcmVzdWx0LnR5cGUgPSByZXN1bHQudHlwZSB8fCAocmVzdWx0LmJ1ZmZlciArICcuZHR5cGUnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY2FjaGVbaWRdID0gcmVzdWx0O1xyXG4gICAgICAgIHJldHVybiByZXN1bHRcclxuICAgICAgfSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBPYmplY3Qua2V5cyhkeW5hbWljQXR0cmlidXRlcykuZm9yRWFjaChmdW5jdGlvbiAoYXR0cmlidXRlKSB7XHJcbiAgICAgIHZhciBkeW4gPSBkeW5hbWljQXR0cmlidXRlc1thdHRyaWJ1dGVdO1xyXG5cclxuICAgICAgZnVuY3Rpb24gYXBwZW5kQXR0cmlidXRlQ29kZSAoZW52LCBibG9jaykge1xyXG4gICAgICAgIHZhciBWQUxVRSA9IGVudi5pbnZva2UoYmxvY2ssIGR5bik7XHJcblxyXG4gICAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkO1xyXG5cclxuICAgICAgICB2YXIgSVNfQlVGRkVSX0FSR1MgPSBzaGFyZWQuaXNCdWZmZXJBcmdzO1xyXG4gICAgICAgIHZhciBCVUZGRVJfU1RBVEUgPSBzaGFyZWQuYnVmZmVyO1xyXG5cclxuICAgICAgICAvLyBQZXJmb3JtIHZhbGlkYXRpb24gb24gYXR0cmlidXRlXHJcbiAgICAgICAgY2hlY2skMS5vcHRpb25hbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICBlbnYuYXNzZXJ0KGJsb2NrLFxyXG4gICAgICAgICAgICBWQUxVRSArICcmJih0eXBlb2YgJyArIFZBTFVFICsgJz09PVwib2JqZWN0XCJ8fHR5cGVvZiAnICtcclxuICAgICAgICAgICAgVkFMVUUgKyAnPT09XCJmdW5jdGlvblwiKSYmKCcgK1xyXG4gICAgICAgICAgICBJU19CVUZGRVJfQVJHUyArICcoJyArIFZBTFVFICsgJyl8fCcgK1xyXG4gICAgICAgICAgICBCVUZGRVJfU1RBVEUgKyAnLmdldEJ1ZmZlcignICsgVkFMVUUgKyAnKXx8JyArXHJcbiAgICAgICAgICAgIEJVRkZFUl9TVEFURSArICcuZ2V0QnVmZmVyKCcgKyBWQUxVRSArICcuYnVmZmVyKXx8JyArXHJcbiAgICAgICAgICAgIElTX0JVRkZFUl9BUkdTICsgJygnICsgVkFMVUUgKyAnLmJ1ZmZlcil8fCcgK1xyXG4gICAgICAgICAgICAnKFwiY29uc3RhbnRcIiBpbiAnICsgVkFMVUUgK1xyXG4gICAgICAgICAgICAnJiYodHlwZW9mICcgKyBWQUxVRSArICcuY29uc3RhbnQ9PT1cIm51bWJlclwifHwnICtcclxuICAgICAgICAgICAgc2hhcmVkLmlzQXJyYXlMaWtlICsgJygnICsgVkFMVUUgKyAnLmNvbnN0YW50KSkpKScsXHJcbiAgICAgICAgICAgICdpbnZhbGlkIGR5bmFtaWMgYXR0cmlidXRlIFwiJyArIGF0dHJpYnV0ZSArICdcIicpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBhbGxvY2F0ZSBuYW1lcyBmb3IgcmVzdWx0XHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IHtcclxuICAgICAgICAgIGlzU3RyZWFtOiBibG9jay5kZWYoZmFsc2UpXHJcbiAgICAgICAgfTtcclxuICAgICAgICB2YXIgZGVmYXVsdFJlY29yZCA9IG5ldyBBdHRyaWJ1dGVSZWNvcmQoKTtcclxuICAgICAgICBkZWZhdWx0UmVjb3JkLnN0YXRlID0gQVRUUklCX1NUQVRFX1BPSU5URVI7XHJcbiAgICAgICAgT2JqZWN0LmtleXMoZGVmYXVsdFJlY29yZCkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XHJcbiAgICAgICAgICByZXN1bHRba2V5XSA9IGJsb2NrLmRlZignJyArIGRlZmF1bHRSZWNvcmRba2V5XSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHZhciBCVUZGRVIgPSByZXN1bHQuYnVmZmVyO1xyXG4gICAgICAgIHZhciBUWVBFID0gcmVzdWx0LnR5cGU7XHJcbiAgICAgICAgYmxvY2soXHJcbiAgICAgICAgICAnaWYoJywgSVNfQlVGRkVSX0FSR1MsICcoJywgVkFMVUUsICcpKXsnLFxyXG4gICAgICAgICAgcmVzdWx0LmlzU3RyZWFtLCAnPXRydWU7JyxcclxuICAgICAgICAgIEJVRkZFUiwgJz0nLCBCVUZGRVJfU1RBVEUsICcuY3JlYXRlU3RyZWFtKCcsIEdMX0FSUkFZX0JVRkZFUiQxLCAnLCcsIFZBTFVFLCAnKTsnLFxyXG4gICAgICAgICAgVFlQRSwgJz0nLCBCVUZGRVIsICcuZHR5cGU7JyxcclxuICAgICAgICAgICd9ZWxzZXsnLFxyXG4gICAgICAgICAgQlVGRkVSLCAnPScsIEJVRkZFUl9TVEFURSwgJy5nZXRCdWZmZXIoJywgVkFMVUUsICcpOycsXHJcbiAgICAgICAgICAnaWYoJywgQlVGRkVSLCAnKXsnLFxyXG4gICAgICAgICAgVFlQRSwgJz0nLCBCVUZGRVIsICcuZHR5cGU7JyxcclxuICAgICAgICAgICd9ZWxzZSBpZihcImNvbnN0YW50XCIgaW4gJywgVkFMVUUsICcpeycsXHJcbiAgICAgICAgICByZXN1bHQuc3RhdGUsICc9JywgQVRUUklCX1NUQVRFX0NPTlNUQU5ULCAnOycsXHJcbiAgICAgICAgICAnaWYodHlwZW9mICcgKyBWQUxVRSArICcuY29uc3RhbnQgPT09IFwibnVtYmVyXCIpeycsXHJcbiAgICAgICAgICByZXN1bHRbQ1VURV9DT01QT05FTlRTWzBdXSwgJz0nLCBWQUxVRSwgJy5jb25zdGFudDsnLFxyXG4gICAgICAgICAgQ1VURV9DT01QT05FTlRTLnNsaWNlKDEpLm1hcChmdW5jdGlvbiAobikge1xyXG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0W25dXHJcbiAgICAgICAgICB9KS5qb2luKCc9JyksICc9MDsnLFxyXG4gICAgICAgICAgJ31lbHNleycsXHJcbiAgICAgICAgICBDVVRFX0NPTVBPTkVOVFMubWFwKGZ1bmN0aW9uIChuYW1lLCBpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAoXHJcbiAgICAgICAgICAgICAgcmVzdWx0W25hbWVdICsgJz0nICsgVkFMVUUgKyAnLmNvbnN0YW50Lmxlbmd0aD4nICsgaSArXHJcbiAgICAgICAgICAgICAgJz8nICsgVkFMVUUgKyAnLmNvbnN0YW50WycgKyBpICsgJ106MDsnXHJcbiAgICAgICAgICAgIClcclxuICAgICAgICAgIH0pLmpvaW4oJycpLFxyXG4gICAgICAgICAgJ319ZWxzZXsnLFxyXG4gICAgICAgICAgJ2lmKCcsIElTX0JVRkZFUl9BUkdTLCAnKCcsIFZBTFVFLCAnLmJ1ZmZlcikpeycsXHJcbiAgICAgICAgICBCVUZGRVIsICc9JywgQlVGRkVSX1NUQVRFLCAnLmNyZWF0ZVN0cmVhbSgnLCBHTF9BUlJBWV9CVUZGRVIkMSwgJywnLCBWQUxVRSwgJy5idWZmZXIpOycsXHJcbiAgICAgICAgICAnfWVsc2V7JyxcclxuICAgICAgICAgIEJVRkZFUiwgJz0nLCBCVUZGRVJfU1RBVEUsICcuZ2V0QnVmZmVyKCcsIFZBTFVFLCAnLmJ1ZmZlcik7JyxcclxuICAgICAgICAgICd9JyxcclxuICAgICAgICAgIFRZUEUsICc9XCJ0eXBlXCIgaW4gJywgVkFMVUUsICc/JyxcclxuICAgICAgICAgIHNoYXJlZC5nbFR5cGVzLCAnWycsIFZBTFVFLCAnLnR5cGVdOicsIEJVRkZFUiwgJy5kdHlwZTsnLFxyXG4gICAgICAgICAgcmVzdWx0Lm5vcm1hbGl6ZWQsICc9ISEnLCBWQUxVRSwgJy5ub3JtYWxpemVkOycpO1xyXG4gICAgICAgIGZ1bmN0aW9uIGVtaXRSZWFkUmVjb3JkIChuYW1lKSB7XHJcbiAgICAgICAgICBibG9jayhyZXN1bHRbbmFtZV0sICc9JywgVkFMVUUsICcuJywgbmFtZSwgJ3wwOycpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbWl0UmVhZFJlY29yZCgnc2l6ZScpO1xyXG4gICAgICAgIGVtaXRSZWFkUmVjb3JkKCdvZmZzZXQnKTtcclxuICAgICAgICBlbWl0UmVhZFJlY29yZCgnc3RyaWRlJyk7XHJcbiAgICAgICAgZW1pdFJlYWRSZWNvcmQoJ2Rpdmlzb3InKTtcclxuXHJcbiAgICAgICAgYmxvY2soJ319Jyk7XHJcblxyXG4gICAgICAgIGJsb2NrLmV4aXQoXHJcbiAgICAgICAgICAnaWYoJywgcmVzdWx0LmlzU3RyZWFtLCAnKXsnLFxyXG4gICAgICAgICAgQlVGRkVSX1NUQVRFLCAnLmRlc3Ryb3lTdHJlYW0oJywgQlVGRkVSLCAnKTsnLFxyXG4gICAgICAgICAgJ30nKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxyXG4gICAgICB9XHJcblxyXG4gICAgICBhdHRyaWJ1dGVEZWZzW2F0dHJpYnV0ZV0gPSBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGFwcGVuZEF0dHJpYnV0ZUNvZGUpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIGF0dHJpYnV0ZURlZnNcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHBhcnNlQ29udGV4dCAoY29udGV4dCkge1xyXG4gICAgdmFyIHN0YXRpY0NvbnRleHQgPSBjb250ZXh0LnN0YXRpYztcclxuICAgIHZhciBkeW5hbWljQ29udGV4dCA9IGNvbnRleHQuZHluYW1pYztcclxuICAgIHZhciByZXN1bHQgPSB7fTtcclxuXHJcbiAgICBPYmplY3Qua2V5cyhzdGF0aWNDb250ZXh0KS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XHJcbiAgICAgIHZhciB2YWx1ZSA9IHN0YXRpY0NvbnRleHRbbmFtZV07XHJcbiAgICAgIHJlc3VsdFtuYW1lXSA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcclxuICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyB8fCB0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykge1xyXG4gICAgICAgICAgcmV0dXJuICcnICsgdmFsdWVcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgcmV0dXJuIGVudi5saW5rKHZhbHVlKVxyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBPYmplY3Qua2V5cyhkeW5hbWljQ29udGV4dCkuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xyXG4gICAgICB2YXIgZHluID0gZHluYW1pY0NvbnRleHRbbmFtZV07XHJcbiAgICAgIHJlc3VsdFtuYW1lXSA9IGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcclxuICAgICAgICByZXR1cm4gZW52Lmludm9rZShzY29wZSwgZHluKVxyXG4gICAgICB9KTtcclxuICAgIH0pO1xyXG5cclxuICAgIHJldHVybiByZXN1bHRcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHBhcnNlQXJndW1lbnRzIChvcHRpb25zLCBhdHRyaWJ1dGVzLCB1bmlmb3JtcywgY29udGV4dCwgZW52KSB7XHJcbiAgICB2YXIgc3RhdGljT3B0aW9ucyA9IG9wdGlvbnMuc3RhdGljO1xyXG4gICAgdmFyIGR5bmFtaWNPcHRpb25zID0gb3B0aW9ucy5keW5hbWljO1xyXG5cclxuICAgIGNoZWNrJDEub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xyXG4gICAgICB2YXIgS0VZX05BTUVTID0gW1xyXG4gICAgICAgIFNfRlJBTUVCVUZGRVIsXHJcbiAgICAgICAgU19WRVJULFxyXG4gICAgICAgIFNfRlJBRyxcclxuICAgICAgICBTX0VMRU1FTlRTLFxyXG4gICAgICAgIFNfUFJJTUlUSVZFLFxyXG4gICAgICAgIFNfT0ZGU0VULFxyXG4gICAgICAgIFNfQ09VTlQsXHJcbiAgICAgICAgU19JTlNUQU5DRVMsXHJcbiAgICAgICAgU19QUk9GSUxFXHJcbiAgICAgIF0uY29uY2F0KEdMX1NUQVRFX05BTUVTKTtcclxuXHJcbiAgICAgIGZ1bmN0aW9uIGNoZWNrS2V5cyAoZGljdCkge1xyXG4gICAgICAgIE9iamVjdC5rZXlzKGRpY3QpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xyXG4gICAgICAgICAgY2hlY2skMS5jb21tYW5kKFxyXG4gICAgICAgICAgICBLRVlfTkFNRVMuaW5kZXhPZihrZXkpID49IDAsXHJcbiAgICAgICAgICAgICd1bmtub3duIHBhcmFtZXRlciBcIicgKyBrZXkgKyAnXCInLFxyXG4gICAgICAgICAgICBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNoZWNrS2V5cyhzdGF0aWNPcHRpb25zKTtcclxuICAgICAgY2hlY2tLZXlzKGR5bmFtaWNPcHRpb25zKTtcclxuICAgIH0pO1xyXG5cclxuICAgIHZhciBmcmFtZWJ1ZmZlciA9IHBhcnNlRnJhbWVidWZmZXIob3B0aW9ucywgZW52KTtcclxuICAgIHZhciB2aWV3cG9ydEFuZFNjaXNzb3IgPSBwYXJzZVZpZXdwb3J0U2Npc3NvcihvcHRpb25zLCBmcmFtZWJ1ZmZlciwgZW52KTtcclxuICAgIHZhciBkcmF3ID0gcGFyc2VEcmF3KG9wdGlvbnMsIGVudik7XHJcbiAgICB2YXIgc3RhdGUgPSBwYXJzZUdMU3RhdGUob3B0aW9ucywgZW52KTtcclxuICAgIHZhciBzaGFkZXIgPSBwYXJzZVByb2dyYW0ob3B0aW9ucywgZW52KTtcclxuXHJcbiAgICBmdW5jdGlvbiBjb3B5Qm94IChuYW1lKSB7XHJcbiAgICAgIHZhciBkZWZuID0gdmlld3BvcnRBbmRTY2lzc29yW25hbWVdO1xyXG4gICAgICBpZiAoZGVmbikge1xyXG4gICAgICAgIHN0YXRlW25hbWVdID0gZGVmbjtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgY29weUJveChTX1ZJRVdQT1JUKTtcclxuICAgIGNvcHlCb3gocHJvcE5hbWUoU19TQ0lTU09SX0JPWCkpO1xyXG5cclxuICAgIHZhciBkaXJ0eSA9IE9iamVjdC5rZXlzKHN0YXRlKS5sZW5ndGggPiAwO1xyXG5cclxuICAgIHZhciByZXN1bHQgPSB7XHJcbiAgICAgIGZyYW1lYnVmZmVyOiBmcmFtZWJ1ZmZlcixcclxuICAgICAgZHJhdzogZHJhdyxcclxuICAgICAgc2hhZGVyOiBzaGFkZXIsXHJcbiAgICAgIHN0YXRlOiBzdGF0ZSxcclxuICAgICAgZGlydHk6IGRpcnR5XHJcbiAgICB9O1xyXG5cclxuICAgIHJlc3VsdC5wcm9maWxlID0gcGFyc2VQcm9maWxlKG9wdGlvbnMsIGVudik7XHJcbiAgICByZXN1bHQudW5pZm9ybXMgPSBwYXJzZVVuaWZvcm1zKHVuaWZvcm1zLCBlbnYpO1xyXG4gICAgcmVzdWx0LmF0dHJpYnV0ZXMgPSBwYXJzZUF0dHJpYnV0ZXMoYXR0cmlidXRlcywgZW52KTtcclxuICAgIHJlc3VsdC5jb250ZXh0ID0gcGFyc2VDb250ZXh0KGNvbnRleHQsIGVudik7XHJcbiAgICByZXR1cm4gcmVzdWx0XHJcbiAgfVxyXG5cclxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAvLyBDT01NT04gVVBEQVRFIEZVTkNUSU9OU1xyXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gIGZ1bmN0aW9uIGVtaXRDb250ZXh0IChlbnYsIHNjb3BlLCBjb250ZXh0KSB7XHJcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZDtcclxuICAgIHZhciBDT05URVhUID0gc2hhcmVkLmNvbnRleHQ7XHJcblxyXG4gICAgdmFyIGNvbnRleHRFbnRlciA9IGVudi5zY29wZSgpO1xyXG5cclxuICAgIE9iamVjdC5rZXlzKGNvbnRleHQpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcclxuICAgICAgc2NvcGUuc2F2ZShDT05URVhULCAnLicgKyBuYW1lKTtcclxuICAgICAgdmFyIGRlZm4gPSBjb250ZXh0W25hbWVdO1xyXG4gICAgICBjb250ZXh0RW50ZXIoQ09OVEVYVCwgJy4nLCBuYW1lLCAnPScsIGRlZm4uYXBwZW5kKGVudiwgc2NvcGUpLCAnOycpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgc2NvcGUoY29udGV4dEVudGVyKTtcclxuICB9XHJcblxyXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gIC8vIENPTU1PTiBEUkFXSU5HIEZVTkNUSU9OU1xyXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gIGZ1bmN0aW9uIGVtaXRQb2xsRnJhbWVidWZmZXIgKGVudiwgc2NvcGUsIGZyYW1lYnVmZmVyLCBza2lwQ2hlY2spIHtcclxuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkO1xyXG5cclxuICAgIHZhciBHTCA9IHNoYXJlZC5nbDtcclxuICAgIHZhciBGUkFNRUJVRkZFUl9TVEFURSA9IHNoYXJlZC5mcmFtZWJ1ZmZlcjtcclxuICAgIHZhciBFWFRfRFJBV19CVUZGRVJTO1xyXG4gICAgaWYgKGV4dERyYXdCdWZmZXJzKSB7XHJcbiAgICAgIEVYVF9EUkFXX0JVRkZFUlMgPSBzY29wZS5kZWYoc2hhcmVkLmV4dGVuc2lvbnMsICcud2ViZ2xfZHJhd19idWZmZXJzJyk7XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIGNvbnN0YW50cyA9IGVudi5jb25zdGFudHM7XHJcblxyXG4gICAgdmFyIERSQVdfQlVGRkVSUyA9IGNvbnN0YW50cy5kcmF3QnVmZmVyO1xyXG4gICAgdmFyIEJBQ0tfQlVGRkVSID0gY29uc3RhbnRzLmJhY2tCdWZmZXI7XHJcblxyXG4gICAgdmFyIE5FWFQ7XHJcbiAgICBpZiAoZnJhbWVidWZmZXIpIHtcclxuICAgICAgTkVYVCA9IGZyYW1lYnVmZmVyLmFwcGVuZChlbnYsIHNjb3BlKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIE5FWFQgPSBzY29wZS5kZWYoRlJBTUVCVUZGRVJfU1RBVEUsICcubmV4dCcpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICghc2tpcENoZWNrKSB7XHJcbiAgICAgIHNjb3BlKCdpZignLCBORVhULCAnIT09JywgRlJBTUVCVUZGRVJfU1RBVEUsICcuY3VyKXsnKTtcclxuICAgIH1cclxuICAgIHNjb3BlKFxyXG4gICAgICAnaWYoJywgTkVYVCwgJyl7JyxcclxuICAgICAgR0wsICcuYmluZEZyYW1lYnVmZmVyKCcsIEdMX0ZSQU1FQlVGRkVSJDIsICcsJywgTkVYVCwgJy5mcmFtZWJ1ZmZlcik7Jyk7XHJcbiAgICBpZiAoZXh0RHJhd0J1ZmZlcnMpIHtcclxuICAgICAgc2NvcGUoRVhUX0RSQVdfQlVGRkVSUywgJy5kcmF3QnVmZmVyc1dFQkdMKCcsXHJcbiAgICAgICAgRFJBV19CVUZGRVJTLCAnWycsIE5FWFQsICcuY29sb3JBdHRhY2htZW50cy5sZW5ndGhdKTsnKTtcclxuICAgIH1cclxuICAgIHNjb3BlKCd9ZWxzZXsnLFxyXG4gICAgICBHTCwgJy5iaW5kRnJhbWVidWZmZXIoJywgR0xfRlJBTUVCVUZGRVIkMiwgJyxudWxsKTsnKTtcclxuICAgIGlmIChleHREcmF3QnVmZmVycykge1xyXG4gICAgICBzY29wZShFWFRfRFJBV19CVUZGRVJTLCAnLmRyYXdCdWZmZXJzV0VCR0woJywgQkFDS19CVUZGRVIsICcpOycpO1xyXG4gICAgfVxyXG4gICAgc2NvcGUoXHJcbiAgICAgICd9JyxcclxuICAgICAgRlJBTUVCVUZGRVJfU1RBVEUsICcuY3VyPScsIE5FWFQsICc7Jyk7XHJcbiAgICBpZiAoIXNraXBDaGVjaykge1xyXG4gICAgICBzY29wZSgnfScpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZW1pdFBvbGxTdGF0ZSAoZW52LCBzY29wZSwgYXJncykge1xyXG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWQ7XHJcblxyXG4gICAgdmFyIEdMID0gc2hhcmVkLmdsO1xyXG5cclxuICAgIHZhciBDVVJSRU5UX1ZBUlMgPSBlbnYuY3VycmVudDtcclxuICAgIHZhciBORVhUX1ZBUlMgPSBlbnYubmV4dDtcclxuICAgIHZhciBDVVJSRU5UX1NUQVRFID0gc2hhcmVkLmN1cnJlbnQ7XHJcbiAgICB2YXIgTkVYVF9TVEFURSA9IHNoYXJlZC5uZXh0O1xyXG5cclxuICAgIHZhciBibG9jayA9IGVudi5jb25kKENVUlJFTlRfU1RBVEUsICcuZGlydHknKTtcclxuXHJcbiAgICBHTF9TVEFURV9OQU1FUy5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XHJcbiAgICAgIHZhciBwYXJhbSA9IHByb3BOYW1lKHByb3ApO1xyXG4gICAgICBpZiAocGFyYW0gaW4gYXJncy5zdGF0ZSkge1xyXG4gICAgICAgIHJldHVyblxyXG4gICAgICB9XHJcblxyXG4gICAgICB2YXIgTkVYVCwgQ1VSUkVOVDtcclxuICAgICAgaWYgKHBhcmFtIGluIE5FWFRfVkFSUykge1xyXG4gICAgICAgIE5FWFQgPSBORVhUX1ZBUlNbcGFyYW1dO1xyXG4gICAgICAgIENVUlJFTlQgPSBDVVJSRU5UX1ZBUlNbcGFyYW1dO1xyXG4gICAgICAgIHZhciBwYXJ0cyA9IGxvb3AoY3VycmVudFN0YXRlW3BhcmFtXS5sZW5ndGgsIGZ1bmN0aW9uIChpKSB7XHJcbiAgICAgICAgICByZXR1cm4gYmxvY2suZGVmKE5FWFQsICdbJywgaSwgJ10nKVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGJsb2NrKGVudi5jb25kKHBhcnRzLm1hcChmdW5jdGlvbiAocCwgaSkge1xyXG4gICAgICAgICAgcmV0dXJuIHAgKyAnIT09JyArIENVUlJFTlQgKyAnWycgKyBpICsgJ10nXHJcbiAgICAgICAgfSkuam9pbignfHwnKSlcclxuICAgICAgICAgIC50aGVuKFxyXG4gICAgICAgICAgICBHTCwgJy4nLCBHTF9WQVJJQUJMRVNbcGFyYW1dLCAnKCcsIHBhcnRzLCAnKTsnLFxyXG4gICAgICAgICAgICBwYXJ0cy5tYXAoZnVuY3Rpb24gKHAsIGkpIHtcclxuICAgICAgICAgICAgICByZXR1cm4gQ1VSUkVOVCArICdbJyArIGkgKyAnXT0nICsgcFxyXG4gICAgICAgICAgICB9KS5qb2luKCc7JyksICc7JykpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIE5FWFQgPSBibG9jay5kZWYoTkVYVF9TVEFURSwgJy4nLCBwYXJhbSk7XHJcbiAgICAgICAgdmFyIGlmdGUgPSBlbnYuY29uZChORVhULCAnIT09JywgQ1VSUkVOVF9TVEFURSwgJy4nLCBwYXJhbSk7XHJcbiAgICAgICAgYmxvY2soaWZ0ZSk7XHJcbiAgICAgICAgaWYgKHBhcmFtIGluIEdMX0ZMQUdTKSB7XHJcbiAgICAgICAgICBpZnRlKFxyXG4gICAgICAgICAgICBlbnYuY29uZChORVhUKVxyXG4gICAgICAgICAgICAgICAgLnRoZW4oR0wsICcuZW5hYmxlKCcsIEdMX0ZMQUdTW3BhcmFtXSwgJyk7JylcclxuICAgICAgICAgICAgICAgIC5lbHNlKEdMLCAnLmRpc2FibGUoJywgR0xfRkxBR1NbcGFyYW1dLCAnKTsnKSxcclxuICAgICAgICAgICAgQ1VSUkVOVF9TVEFURSwgJy4nLCBwYXJhbSwgJz0nLCBORVhULCAnOycpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBpZnRlKFxyXG4gICAgICAgICAgICBHTCwgJy4nLCBHTF9WQVJJQUJMRVNbcGFyYW1dLCAnKCcsIE5FWFQsICcpOycsXHJcbiAgICAgICAgICAgIENVUlJFTlRfU1RBVEUsICcuJywgcGFyYW0sICc9JywgTkVYVCwgJzsnKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gICAgaWYgKE9iamVjdC5rZXlzKGFyZ3Muc3RhdGUpLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICBibG9jayhDVVJSRU5UX1NUQVRFLCAnLmRpcnR5PWZhbHNlOycpO1xyXG4gICAgfVxyXG4gICAgc2NvcGUoYmxvY2spO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZW1pdFNldE9wdGlvbnMgKGVudiwgc2NvcGUsIG9wdGlvbnMsIGZpbHRlcikge1xyXG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWQ7XHJcbiAgICB2YXIgQ1VSUkVOVF9WQVJTID0gZW52LmN1cnJlbnQ7XHJcbiAgICB2YXIgQ1VSUkVOVF9TVEFURSA9IHNoYXJlZC5jdXJyZW50O1xyXG4gICAgdmFyIEdMID0gc2hhcmVkLmdsO1xyXG4gICAgc29ydFN0YXRlKE9iamVjdC5rZXlzKG9wdGlvbnMpKS5mb3JFYWNoKGZ1bmN0aW9uIChwYXJhbSkge1xyXG4gICAgICB2YXIgZGVmbiA9IG9wdGlvbnNbcGFyYW1dO1xyXG4gICAgICBpZiAoZmlsdGVyICYmICFmaWx0ZXIoZGVmbikpIHtcclxuICAgICAgICByZXR1cm5cclxuICAgICAgfVxyXG4gICAgICB2YXIgdmFyaWFibGUgPSBkZWZuLmFwcGVuZChlbnYsIHNjb3BlKTtcclxuICAgICAgaWYgKEdMX0ZMQUdTW3BhcmFtXSkge1xyXG4gICAgICAgIHZhciBmbGFnID0gR0xfRkxBR1NbcGFyYW1dO1xyXG4gICAgICAgIGlmIChpc1N0YXRpYyhkZWZuKSkge1xyXG4gICAgICAgICAgaWYgKHZhcmlhYmxlKSB7XHJcbiAgICAgICAgICAgIHNjb3BlKEdMLCAnLmVuYWJsZSgnLCBmbGFnLCAnKTsnKTtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHNjb3BlKEdMLCAnLmRpc2FibGUoJywgZmxhZywgJyk7Jyk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIHNjb3BlKGVudi5jb25kKHZhcmlhYmxlKVxyXG4gICAgICAgICAgICAudGhlbihHTCwgJy5lbmFibGUoJywgZmxhZywgJyk7JylcclxuICAgICAgICAgICAgLmVsc2UoR0wsICcuZGlzYWJsZSgnLCBmbGFnLCAnKTsnKSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHNjb3BlKENVUlJFTlRfU1RBVEUsICcuJywgcGFyYW0sICc9JywgdmFyaWFibGUsICc7Jyk7XHJcbiAgICAgIH0gZWxzZSBpZiAoaXNBcnJheUxpa2UodmFyaWFibGUpKSB7XHJcbiAgICAgICAgdmFyIENVUlJFTlQgPSBDVVJSRU5UX1ZBUlNbcGFyYW1dO1xyXG4gICAgICAgIHNjb3BlKFxyXG4gICAgICAgICAgR0wsICcuJywgR0xfVkFSSUFCTEVTW3BhcmFtXSwgJygnLCB2YXJpYWJsZSwgJyk7JyxcclxuICAgICAgICAgIHZhcmlhYmxlLm1hcChmdW5jdGlvbiAodiwgaSkge1xyXG4gICAgICAgICAgICByZXR1cm4gQ1VSUkVOVCArICdbJyArIGkgKyAnXT0nICsgdlxyXG4gICAgICAgICAgfSkuam9pbignOycpLCAnOycpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHNjb3BlKFxyXG4gICAgICAgICAgR0wsICcuJywgR0xfVkFSSUFCTEVTW3BhcmFtXSwgJygnLCB2YXJpYWJsZSwgJyk7JyxcclxuICAgICAgICAgIENVUlJFTlRfU1RBVEUsICcuJywgcGFyYW0sICc9JywgdmFyaWFibGUsICc7Jyk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gaW5qZWN0RXh0ZW5zaW9ucyAoZW52LCBzY29wZSkge1xyXG4gICAgaWYgKGV4dEluc3RhbmNpbmcpIHtcclxuICAgICAgZW52Lmluc3RhbmNpbmcgPSBzY29wZS5kZWYoXHJcbiAgICAgICAgZW52LnNoYXJlZC5leHRlbnNpb25zLCAnLmFuZ2xlX2luc3RhbmNlZF9hcnJheXMnKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGVtaXRQcm9maWxlIChlbnYsIHNjb3BlLCBhcmdzLCB1c2VTY29wZSwgaW5jcmVtZW50Q291bnRlcikge1xyXG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWQ7XHJcbiAgICB2YXIgU1RBVFMgPSBlbnYuc3RhdHM7XHJcbiAgICB2YXIgQ1VSUkVOVF9TVEFURSA9IHNoYXJlZC5jdXJyZW50O1xyXG4gICAgdmFyIFRJTUVSID0gc2hhcmVkLnRpbWVyO1xyXG4gICAgdmFyIHByb2ZpbGVBcmcgPSBhcmdzLnByb2ZpbGU7XHJcblxyXG4gICAgZnVuY3Rpb24gcGVyZkNvdW50ZXIgKCkge1xyXG4gICAgICBpZiAodHlwZW9mIHBlcmZvcm1hbmNlID09PSAndW5kZWZpbmVkJykge1xyXG4gICAgICAgIHJldHVybiAnRGF0ZS5ub3coKSdcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICByZXR1cm4gJ3BlcmZvcm1hbmNlLm5vdygpJ1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIENQVV9TVEFSVCwgUVVFUllfQ09VTlRFUjtcclxuICAgIGZ1bmN0aW9uIGVtaXRQcm9maWxlU3RhcnQgKGJsb2NrKSB7XHJcbiAgICAgIENQVV9TVEFSVCA9IHNjb3BlLmRlZigpO1xyXG4gICAgICBibG9jayhDUFVfU1RBUlQsICc9JywgcGVyZkNvdW50ZXIoKSwgJzsnKTtcclxuICAgICAgaWYgKHR5cGVvZiBpbmNyZW1lbnRDb3VudGVyID09PSAnc3RyaW5nJykge1xyXG4gICAgICAgIGJsb2NrKFNUQVRTLCAnLmNvdW50Kz0nLCBpbmNyZW1lbnRDb3VudGVyLCAnOycpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGJsb2NrKFNUQVRTLCAnLmNvdW50Kys7Jyk7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKHRpbWVyKSB7XHJcbiAgICAgICAgaWYgKHVzZVNjb3BlKSB7XHJcbiAgICAgICAgICBRVUVSWV9DT1VOVEVSID0gc2NvcGUuZGVmKCk7XHJcbiAgICAgICAgICBibG9jayhRVUVSWV9DT1VOVEVSLCAnPScsIFRJTUVSLCAnLmdldE51bVBlbmRpbmdRdWVyaWVzKCk7Jyk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGJsb2NrKFRJTUVSLCAnLmJlZ2luUXVlcnkoJywgU1RBVFMsICcpOycpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGVtaXRQcm9maWxlRW5kIChibG9jaykge1xyXG4gICAgICBibG9jayhTVEFUUywgJy5jcHVUaW1lKz0nLCBwZXJmQ291bnRlcigpLCAnLScsIENQVV9TVEFSVCwgJzsnKTtcclxuICAgICAgaWYgKHRpbWVyKSB7XHJcbiAgICAgICAgaWYgKHVzZVNjb3BlKSB7XHJcbiAgICAgICAgICBibG9jayhUSU1FUiwgJy5wdXNoU2NvcGVTdGF0cygnLFxyXG4gICAgICAgICAgICBRVUVSWV9DT1VOVEVSLCAnLCcsXHJcbiAgICAgICAgICAgIFRJTUVSLCAnLmdldE51bVBlbmRpbmdRdWVyaWVzKCksJyxcclxuICAgICAgICAgICAgU1RBVFMsICcpOycpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBibG9jayhUSU1FUiwgJy5lbmRRdWVyeSgpOycpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHNjb3BlUHJvZmlsZSAodmFsdWUpIHtcclxuICAgICAgdmFyIHByZXYgPSBzY29wZS5kZWYoQ1VSUkVOVF9TVEFURSwgJy5wcm9maWxlJyk7XHJcbiAgICAgIHNjb3BlKENVUlJFTlRfU1RBVEUsICcucHJvZmlsZT0nLCB2YWx1ZSwgJzsnKTtcclxuICAgICAgc2NvcGUuZXhpdChDVVJSRU5UX1NUQVRFLCAnLnByb2ZpbGU9JywgcHJldiwgJzsnKTtcclxuICAgIH1cclxuXHJcbiAgICB2YXIgVVNFX1BST0ZJTEU7XHJcbiAgICBpZiAocHJvZmlsZUFyZykge1xyXG4gICAgICBpZiAoaXNTdGF0aWMocHJvZmlsZUFyZykpIHtcclxuICAgICAgICBpZiAocHJvZmlsZUFyZy5lbmFibGUpIHtcclxuICAgICAgICAgIGVtaXRQcm9maWxlU3RhcnQoc2NvcGUpO1xyXG4gICAgICAgICAgZW1pdFByb2ZpbGVFbmQoc2NvcGUuZXhpdCk7XHJcbiAgICAgICAgICBzY29wZVByb2ZpbGUoJ3RydWUnKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgc2NvcGVQcm9maWxlKCdmYWxzZScpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm5cclxuICAgICAgfVxyXG4gICAgICBVU0VfUFJPRklMRSA9IHByb2ZpbGVBcmcuYXBwZW5kKGVudiwgc2NvcGUpO1xyXG4gICAgICBzY29wZVByb2ZpbGUoVVNFX1BST0ZJTEUpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgVVNFX1BST0ZJTEUgPSBzY29wZS5kZWYoQ1VSUkVOVF9TVEFURSwgJy5wcm9maWxlJyk7XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIHN0YXJ0ID0gZW52LmJsb2NrKCk7XHJcbiAgICBlbWl0UHJvZmlsZVN0YXJ0KHN0YXJ0KTtcclxuICAgIHNjb3BlKCdpZignLCBVU0VfUFJPRklMRSwgJyl7Jywgc3RhcnQsICd9Jyk7XHJcbiAgICB2YXIgZW5kID0gZW52LmJsb2NrKCk7XHJcbiAgICBlbWl0UHJvZmlsZUVuZChlbmQpO1xyXG4gICAgc2NvcGUuZXhpdCgnaWYoJywgVVNFX1BST0ZJTEUsICcpeycsIGVuZCwgJ30nKTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGVtaXRBdHRyaWJ1dGVzIChlbnYsIHNjb3BlLCBhcmdzLCBhdHRyaWJ1dGVzLCBmaWx0ZXIpIHtcclxuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkO1xyXG5cclxuICAgIGZ1bmN0aW9uIHR5cGVMZW5ndGggKHgpIHtcclxuICAgICAgc3dpdGNoICh4KSB7XHJcbiAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMyOlxyXG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzI6XHJcbiAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzI6XHJcbiAgICAgICAgICByZXR1cm4gMlxyXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMzpcclxuICAgICAgICBjYXNlIEdMX0lOVF9WRUMzOlxyXG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUMzOlxyXG4gICAgICAgICAgcmV0dXJuIDNcclxuICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzQ6XHJcbiAgICAgICAgY2FzZSBHTF9JTlRfVkVDNDpcclxuICAgICAgICBjYXNlIEdMX0JPT0xfVkVDNDpcclxuICAgICAgICAgIHJldHVybiA0XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgIHJldHVybiAxXHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBlbWl0QmluZEF0dHJpYnV0ZSAoQVRUUklCVVRFLCBzaXplLCByZWNvcmQpIHtcclxuICAgICAgdmFyIEdMID0gc2hhcmVkLmdsO1xyXG5cclxuICAgICAgdmFyIExPQ0FUSU9OID0gc2NvcGUuZGVmKEFUVFJJQlVURSwgJy5sb2NhdGlvbicpO1xyXG4gICAgICB2YXIgQklORElORyA9IHNjb3BlLmRlZihzaGFyZWQuYXR0cmlidXRlcywgJ1snLCBMT0NBVElPTiwgJ10nKTtcclxuXHJcbiAgICAgIHZhciBTVEFURSA9IHJlY29yZC5zdGF0ZTtcclxuICAgICAgdmFyIEJVRkZFUiA9IHJlY29yZC5idWZmZXI7XHJcbiAgICAgIHZhciBDT05TVF9DT01QT05FTlRTID0gW1xyXG4gICAgICAgIHJlY29yZC54LFxyXG4gICAgICAgIHJlY29yZC55LFxyXG4gICAgICAgIHJlY29yZC56LFxyXG4gICAgICAgIHJlY29yZC53XHJcbiAgICAgIF07XHJcblxyXG4gICAgICB2YXIgQ09NTU9OX0tFWVMgPSBbXHJcbiAgICAgICAgJ2J1ZmZlcicsXHJcbiAgICAgICAgJ25vcm1hbGl6ZWQnLFxyXG4gICAgICAgICdvZmZzZXQnLFxyXG4gICAgICAgICdzdHJpZGUnXHJcbiAgICAgIF07XHJcblxyXG4gICAgICBmdW5jdGlvbiBlbWl0QnVmZmVyICgpIHtcclxuICAgICAgICBzY29wZShcclxuICAgICAgICAgICdpZighJywgQklORElORywgJy5idWZmZXIpeycsXHJcbiAgICAgICAgICBHTCwgJy5lbmFibGVWZXJ0ZXhBdHRyaWJBcnJheSgnLCBMT0NBVElPTiwgJyk7fScpO1xyXG5cclxuICAgICAgICB2YXIgVFlQRSA9IHJlY29yZC50eXBlO1xyXG4gICAgICAgIHZhciBTSVpFO1xyXG4gICAgICAgIGlmICghcmVjb3JkLnNpemUpIHtcclxuICAgICAgICAgIFNJWkUgPSBzaXplO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBTSVpFID0gc2NvcGUuZGVmKHJlY29yZC5zaXplLCAnfHwnLCBzaXplKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHNjb3BlKCdpZignLFxyXG4gICAgICAgICAgQklORElORywgJy50eXBlIT09JywgVFlQRSwgJ3x8JyxcclxuICAgICAgICAgIEJJTkRJTkcsICcuc2l6ZSE9PScsIFNJWkUsICd8fCcsXHJcbiAgICAgICAgICBDT01NT05fS0VZUy5tYXAoZnVuY3Rpb24gKGtleSkge1xyXG4gICAgICAgICAgICByZXR1cm4gQklORElORyArICcuJyArIGtleSArICchPT0nICsgcmVjb3JkW2tleV1cclxuICAgICAgICAgIH0pLmpvaW4oJ3x8JyksXHJcbiAgICAgICAgICAnKXsnLFxyXG4gICAgICAgICAgR0wsICcuYmluZEJ1ZmZlcignLCBHTF9BUlJBWV9CVUZGRVIkMSwgJywnLCBCVUZGRVIsICcuYnVmZmVyKTsnLFxyXG4gICAgICAgICAgR0wsICcudmVydGV4QXR0cmliUG9pbnRlcignLCBbXHJcbiAgICAgICAgICAgIExPQ0FUSU9OLFxyXG4gICAgICAgICAgICBTSVpFLFxyXG4gICAgICAgICAgICBUWVBFLFxyXG4gICAgICAgICAgICByZWNvcmQubm9ybWFsaXplZCxcclxuICAgICAgICAgICAgcmVjb3JkLnN0cmlkZSxcclxuICAgICAgICAgICAgcmVjb3JkLm9mZnNldFxyXG4gICAgICAgICAgXSwgJyk7JyxcclxuICAgICAgICAgIEJJTkRJTkcsICcudHlwZT0nLCBUWVBFLCAnOycsXHJcbiAgICAgICAgICBCSU5ESU5HLCAnLnNpemU9JywgU0laRSwgJzsnLFxyXG4gICAgICAgICAgQ09NTU9OX0tFWVMubWFwKGZ1bmN0aW9uIChrZXkpIHtcclxuICAgICAgICAgICAgcmV0dXJuIEJJTkRJTkcgKyAnLicgKyBrZXkgKyAnPScgKyByZWNvcmRba2V5XSArICc7J1xyXG4gICAgICAgICAgfSkuam9pbignJyksXHJcbiAgICAgICAgICAnfScpO1xyXG5cclxuICAgICAgICBpZiAoZXh0SW5zdGFuY2luZykge1xyXG4gICAgICAgICAgdmFyIERJVklTT1IgPSByZWNvcmQuZGl2aXNvcjtcclxuICAgICAgICAgIHNjb3BlKFxyXG4gICAgICAgICAgICAnaWYoJywgQklORElORywgJy5kaXZpc29yIT09JywgRElWSVNPUiwgJyl7JyxcclxuICAgICAgICAgICAgZW52Lmluc3RhbmNpbmcsICcudmVydGV4QXR0cmliRGl2aXNvckFOR0xFKCcsIFtMT0NBVElPTiwgRElWSVNPUl0sICcpOycsXHJcbiAgICAgICAgICAgIEJJTkRJTkcsICcuZGl2aXNvcj0nLCBESVZJU09SLCAnO30nKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGZ1bmN0aW9uIGVtaXRDb25zdGFudCAoKSB7XHJcbiAgICAgICAgc2NvcGUoXHJcbiAgICAgICAgICAnaWYoJywgQklORElORywgJy5idWZmZXIpeycsXHJcbiAgICAgICAgICBHTCwgJy5kaXNhYmxlVmVydGV4QXR0cmliQXJyYXkoJywgTE9DQVRJT04sICcpOycsXHJcbiAgICAgICAgICAnfWlmKCcsIENVVEVfQ09NUE9ORU5UUy5tYXAoZnVuY3Rpb24gKGMsIGkpIHtcclxuICAgICAgICAgICAgcmV0dXJuIEJJTkRJTkcgKyAnLicgKyBjICsgJyE9PScgKyBDT05TVF9DT01QT05FTlRTW2ldXHJcbiAgICAgICAgICB9KS5qb2luKCd8fCcpLCAnKXsnLFxyXG4gICAgICAgICAgR0wsICcudmVydGV4QXR0cmliNGYoJywgTE9DQVRJT04sICcsJywgQ09OU1RfQ09NUE9ORU5UUywgJyk7JyxcclxuICAgICAgICAgIENVVEVfQ09NUE9ORU5UUy5tYXAoZnVuY3Rpb24gKGMsIGkpIHtcclxuICAgICAgICAgICAgcmV0dXJuIEJJTkRJTkcgKyAnLicgKyBjICsgJz0nICsgQ09OU1RfQ09NUE9ORU5UU1tpXSArICc7J1xyXG4gICAgICAgICAgfSkuam9pbignJyksXHJcbiAgICAgICAgICAnfScpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAoU1RBVEUgPT09IEFUVFJJQl9TVEFURV9QT0lOVEVSKSB7XHJcbiAgICAgICAgZW1pdEJ1ZmZlcigpO1xyXG4gICAgICB9IGVsc2UgaWYgKFNUQVRFID09PSBBVFRSSUJfU1RBVEVfQ09OU1RBTlQpIHtcclxuICAgICAgICBlbWl0Q29uc3RhbnQoKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBzY29wZSgnaWYoJywgU1RBVEUsICc9PT0nLCBBVFRSSUJfU1RBVEVfUE9JTlRFUiwgJyl7Jyk7XHJcbiAgICAgICAgZW1pdEJ1ZmZlcigpO1xyXG4gICAgICAgIHNjb3BlKCd9ZWxzZXsnKTtcclxuICAgICAgICBlbWl0Q29uc3RhbnQoKTtcclxuICAgICAgICBzY29wZSgnfScpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgYXR0cmlidXRlcy5mb3JFYWNoKGZ1bmN0aW9uIChhdHRyaWJ1dGUpIHtcclxuICAgICAgdmFyIG5hbWUgPSBhdHRyaWJ1dGUubmFtZTtcclxuICAgICAgdmFyIGFyZyA9IGFyZ3MuYXR0cmlidXRlc1tuYW1lXTtcclxuICAgICAgdmFyIHJlY29yZDtcclxuICAgICAgaWYgKGFyZykge1xyXG4gICAgICAgIGlmICghZmlsdGVyKGFyZykpIHtcclxuICAgICAgICAgIHJldHVyblxyXG4gICAgICAgIH1cclxuICAgICAgICByZWNvcmQgPSBhcmcuYXBwZW5kKGVudiwgc2NvcGUpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGlmICghZmlsdGVyKFNDT1BFX0RFQ0wpKSB7XHJcbiAgICAgICAgICByZXR1cm5cclxuICAgICAgICB9XHJcbiAgICAgICAgdmFyIHNjb3BlQXR0cmliID0gZW52LnNjb3BlQXR0cmliKG5hbWUpO1xyXG4gICAgICAgIGNoZWNrJDEub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgZW52LmFzc2VydChzY29wZSxcclxuICAgICAgICAgICAgc2NvcGVBdHRyaWIgKyAnLnN0YXRlJyxcclxuICAgICAgICAgICAgJ21pc3NpbmcgYXR0cmlidXRlICcgKyBuYW1lKTtcclxuICAgICAgICB9KTtcclxuICAgICAgICByZWNvcmQgPSB7fTtcclxuICAgICAgICBPYmplY3Qua2V5cyhuZXcgQXR0cmlidXRlUmVjb3JkKCkpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xyXG4gICAgICAgICAgcmVjb3JkW2tleV0gPSBzY29wZS5kZWYoc2NvcGVBdHRyaWIsICcuJywga2V5KTtcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgICBlbWl0QmluZEF0dHJpYnV0ZShcclxuICAgICAgICBlbnYubGluayhhdHRyaWJ1dGUpLCB0eXBlTGVuZ3RoKGF0dHJpYnV0ZS5pbmZvLnR5cGUpLCByZWNvcmQpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBlbWl0VW5pZm9ybXMgKGVudiwgc2NvcGUsIGFyZ3MsIHVuaWZvcm1zLCBmaWx0ZXIpIHtcclxuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkO1xyXG4gICAgdmFyIEdMID0gc2hhcmVkLmdsO1xyXG5cclxuICAgIHZhciBpbmZpeDtcclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdW5pZm9ybXMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgdmFyIHVuaWZvcm0gPSB1bmlmb3Jtc1tpXTtcclxuICAgICAgdmFyIG5hbWUgPSB1bmlmb3JtLm5hbWU7XHJcbiAgICAgIHZhciB0eXBlID0gdW5pZm9ybS5pbmZvLnR5cGU7XHJcbiAgICAgIHZhciBhcmcgPSBhcmdzLnVuaWZvcm1zW25hbWVdO1xyXG4gICAgICB2YXIgVU5JRk9STSA9IGVudi5saW5rKHVuaWZvcm0pO1xyXG4gICAgICB2YXIgTE9DQVRJT04gPSBVTklGT1JNICsgJy5sb2NhdGlvbic7XHJcblxyXG4gICAgICB2YXIgVkFMVUU7XHJcbiAgICAgIGlmIChhcmcpIHtcclxuICAgICAgICBpZiAoIWZpbHRlcihhcmcpKSB7XHJcbiAgICAgICAgICBjb250aW51ZVxyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoaXNTdGF0aWMoYXJnKSkge1xyXG4gICAgICAgICAgdmFyIHZhbHVlID0gYXJnLnZhbHVlO1xyXG4gICAgICAgICAgY2hlY2skMS5jb21tYW5kKFxyXG4gICAgICAgICAgICB2YWx1ZSAhPT0gbnVsbCAmJiB0eXBlb2YgdmFsdWUgIT09ICd1bmRlZmluZWQnLFxyXG4gICAgICAgICAgICAnbWlzc2luZyB1bmlmb3JtIFwiJyArIG5hbWUgKyAnXCInLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICBpZiAodHlwZSA9PT0gR0xfU0FNUExFUl8yRCB8fCB0eXBlID09PSBHTF9TQU1QTEVSX0NVQkUpIHtcclxuICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kKFxyXG4gICAgICAgICAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJyAmJlxyXG4gICAgICAgICAgICAgICgodHlwZSA9PT0gR0xfU0FNUExFUl8yRCAmJlxyXG4gICAgICAgICAgICAgICAgKHZhbHVlLl9yZWdsVHlwZSA9PT0gJ3RleHR1cmUyZCcgfHxcclxuICAgICAgICAgICAgICAgIHZhbHVlLl9yZWdsVHlwZSA9PT0gJ2ZyYW1lYnVmZmVyJykpIHx8XHJcbiAgICAgICAgICAgICAgKHR5cGUgPT09IEdMX1NBTVBMRVJfQ1VCRSAmJlxyXG4gICAgICAgICAgICAgICAgKHZhbHVlLl9yZWdsVHlwZSA9PT0gJ3RleHR1cmVDdWJlJyB8fFxyXG4gICAgICAgICAgICAgICAgdmFsdWUuX3JlZ2xUeXBlID09PSAnZnJhbWVidWZmZXJDdWJlJykpKSxcclxuICAgICAgICAgICAgICAnaW52YWxpZCB0ZXh0dXJlIGZvciB1bmlmb3JtICcgKyBuYW1lLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgIHZhciBURVhfVkFMVUUgPSBlbnYubGluayh2YWx1ZS5fdGV4dHVyZSB8fCB2YWx1ZS5jb2xvclswXS5fdGV4dHVyZSk7XHJcbiAgICAgICAgICAgIHNjb3BlKEdMLCAnLnVuaWZvcm0xaSgnLCBMT0NBVElPTiwgJywnLCBURVhfVkFMVUUgKyAnLmJpbmQoKSk7Jyk7XHJcbiAgICAgICAgICAgIHNjb3BlLmV4aXQoVEVYX1ZBTFVFLCAnLnVuYmluZCgpOycpO1xyXG4gICAgICAgICAgfSBlbHNlIGlmIChcclxuICAgICAgICAgICAgdHlwZSA9PT0gR0xfRkxPQVRfTUFUMiB8fFxyXG4gICAgICAgICAgICB0eXBlID09PSBHTF9GTE9BVF9NQVQzIHx8XHJcbiAgICAgICAgICAgIHR5cGUgPT09IEdMX0ZMT0FUX01BVDQpIHtcclxuICAgICAgICAgICAgY2hlY2skMS5vcHRpb25hbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kKGlzQXJyYXlMaWtlKHZhbHVlKSxcclxuICAgICAgICAgICAgICAgICdpbnZhbGlkIG1hdHJpeCBmb3IgdW5pZm9ybSAnICsgbmFtZSwgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZChcclxuICAgICAgICAgICAgICAgICh0eXBlID09PSBHTF9GTE9BVF9NQVQyICYmIHZhbHVlLmxlbmd0aCA9PT0gNCkgfHxcclxuICAgICAgICAgICAgICAgICh0eXBlID09PSBHTF9GTE9BVF9NQVQzICYmIHZhbHVlLmxlbmd0aCA9PT0gOSkgfHxcclxuICAgICAgICAgICAgICAgICh0eXBlID09PSBHTF9GTE9BVF9NQVQ0ICYmIHZhbHVlLmxlbmd0aCA9PT0gMTYpLFxyXG4gICAgICAgICAgICAgICAgJ2ludmFsaWQgbGVuZ3RoIGZvciBtYXRyaXggdW5pZm9ybSAnICsgbmFtZSwgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgdmFyIE1BVF9WQUxVRSA9IGVudi5nbG9iYWwuZGVmKCduZXcgRmxvYXQzMkFycmF5KFsnICtcclxuICAgICAgICAgICAgICBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh2YWx1ZSkgKyAnXSknKTtcclxuICAgICAgICAgICAgdmFyIGRpbSA9IDI7XHJcbiAgICAgICAgICAgIGlmICh0eXBlID09PSBHTF9GTE9BVF9NQVQzKSB7XHJcbiAgICAgICAgICAgICAgZGltID0gMztcclxuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSBHTF9GTE9BVF9NQVQ0KSB7XHJcbiAgICAgICAgICAgICAgZGltID0gNDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBzY29wZShcclxuICAgICAgICAgICAgICBHTCwgJy51bmlmb3JtTWF0cml4JywgZGltLCAnZnYoJyxcclxuICAgICAgICAgICAgICBMT0NBVElPTiwgJyxmYWxzZSwnLCBNQVRfVkFMVUUsICcpOycpO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgc3dpdGNoICh0eXBlKSB7XHJcbiAgICAgICAgICAgICAgY2FzZSBHTF9GTE9BVCQ4OlxyXG4gICAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kVHlwZSh2YWx1ZSwgJ251bWJlcicsICd1bmlmb3JtICcgKyBuYW1lLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICcxZic7XHJcbiAgICAgICAgICAgICAgICBicmVha1xyXG4gICAgICAgICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMjpcclxuICAgICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZChcclxuICAgICAgICAgICAgICAgICAgaXNBcnJheUxpa2UodmFsdWUpICYmIHZhbHVlLmxlbmd0aCA9PT0gMixcclxuICAgICAgICAgICAgICAgICAgJ3VuaWZvcm0gJyArIG5hbWUsIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgICAgIGluZml4ID0gJzJmJztcclxuICAgICAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMzOlxyXG4gICAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kKFxyXG4gICAgICAgICAgICAgICAgICBpc0FycmF5TGlrZSh2YWx1ZSkgJiYgdmFsdWUubGVuZ3RoID09PSAzLFxyXG4gICAgICAgICAgICAgICAgICAndW5pZm9ybSAnICsgbmFtZSwgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgICAgaW5maXggPSAnM2YnO1xyXG4gICAgICAgICAgICAgICAgYnJlYWtcclxuICAgICAgICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzQ6XHJcbiAgICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmQoXHJcbiAgICAgICAgICAgICAgICAgIGlzQXJyYXlMaWtlKHZhbHVlKSAmJiB2YWx1ZS5sZW5ndGggPT09IDQsXHJcbiAgICAgICAgICAgICAgICAgICd1bmlmb3JtICcgKyBuYW1lLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICc0Zic7XHJcbiAgICAgICAgICAgICAgICBicmVha1xyXG4gICAgICAgICAgICAgIGNhc2UgR0xfQk9PTDpcclxuICAgICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZFR5cGUodmFsdWUsICdib29sZWFuJywgJ3VuaWZvcm0gJyArIG5hbWUsIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgICAgIGluZml4ID0gJzFpJztcclxuICAgICAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgICAgICAgY2FzZSBHTF9JTlQkMzpcclxuICAgICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZFR5cGUodmFsdWUsICdudW1iZXInLCAndW5pZm9ybSAnICsgbmFtZSwgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgICAgaW5maXggPSAnMWknO1xyXG4gICAgICAgICAgICAgICAgYnJlYWtcclxuICAgICAgICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMjpcclxuICAgICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZChcclxuICAgICAgICAgICAgICAgICAgaXNBcnJheUxpa2UodmFsdWUpICYmIHZhbHVlLmxlbmd0aCA9PT0gMixcclxuICAgICAgICAgICAgICAgICAgJ3VuaWZvcm0gJyArIG5hbWUsIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgICAgIGluZml4ID0gJzJpJztcclxuICAgICAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgICAgICAgY2FzZSBHTF9JTlRfVkVDMjpcclxuICAgICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZChcclxuICAgICAgICAgICAgICAgICAgaXNBcnJheUxpa2UodmFsdWUpICYmIHZhbHVlLmxlbmd0aCA9PT0gMixcclxuICAgICAgICAgICAgICAgICAgJ3VuaWZvcm0gJyArIG5hbWUsIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgICAgIGluZml4ID0gJzJpJztcclxuICAgICAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzM6XHJcbiAgICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmQoXHJcbiAgICAgICAgICAgICAgICAgIGlzQXJyYXlMaWtlKHZhbHVlKSAmJiB2YWx1ZS5sZW5ndGggPT09IDMsXHJcbiAgICAgICAgICAgICAgICAgICd1bmlmb3JtICcgKyBuYW1lLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICczaSc7XHJcbiAgICAgICAgICAgICAgICBicmVha1xyXG4gICAgICAgICAgICAgIGNhc2UgR0xfSU5UX1ZFQzM6XHJcbiAgICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmQoXHJcbiAgICAgICAgICAgICAgICAgIGlzQXJyYXlMaWtlKHZhbHVlKSAmJiB2YWx1ZS5sZW5ndGggPT09IDMsXHJcbiAgICAgICAgICAgICAgICAgICd1bmlmb3JtICcgKyBuYW1lLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICczaSc7XHJcbiAgICAgICAgICAgICAgICBicmVha1xyXG4gICAgICAgICAgICAgIGNhc2UgR0xfQk9PTF9WRUM0OlxyXG4gICAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kKFxyXG4gICAgICAgICAgICAgICAgICBpc0FycmF5TGlrZSh2YWx1ZSkgJiYgdmFsdWUubGVuZ3RoID09PSA0LFxyXG4gICAgICAgICAgICAgICAgICAndW5pZm9ybSAnICsgbmFtZSwgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgICAgaW5maXggPSAnNGknO1xyXG4gICAgICAgICAgICAgICAgYnJlYWtcclxuICAgICAgICAgICAgICBjYXNlIEdMX0lOVF9WRUM0OlxyXG4gICAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kKFxyXG4gICAgICAgICAgICAgICAgICBpc0FycmF5TGlrZSh2YWx1ZSkgJiYgdmFsdWUubGVuZ3RoID09PSA0LFxyXG4gICAgICAgICAgICAgICAgICAndW5pZm9ybSAnICsgbmFtZSwgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgICAgaW5maXggPSAnNGknO1xyXG4gICAgICAgICAgICAgICAgYnJlYWtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBzY29wZShHTCwgJy51bmlmb3JtJywgaW5maXgsICcoJywgTE9DQVRJT04sICcsJyxcclxuICAgICAgICAgICAgICBpc0FycmF5TGlrZSh2YWx1ZSkgPyBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh2YWx1ZSkgOiB2YWx1ZSxcclxuICAgICAgICAgICAgICAnKTsnKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGNvbnRpbnVlXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIFZBTFVFID0gYXJnLmFwcGVuZChlbnYsIHNjb3BlKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgaWYgKCFmaWx0ZXIoU0NPUEVfREVDTCkpIHtcclxuICAgICAgICAgIGNvbnRpbnVlXHJcbiAgICAgICAgfVxyXG4gICAgICAgIFZBTFVFID0gc2NvcGUuZGVmKHNoYXJlZC51bmlmb3JtcywgJ1snLCBzdHJpbmdTdG9yZS5pZChuYW1lKSwgJ10nKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKHR5cGUgPT09IEdMX1NBTVBMRVJfMkQpIHtcclxuICAgICAgICBzY29wZShcclxuICAgICAgICAgICdpZignLCBWQUxVRSwgJyYmJywgVkFMVUUsICcuX3JlZ2xUeXBlPT09XCJmcmFtZWJ1ZmZlclwiKXsnLFxyXG4gICAgICAgICAgVkFMVUUsICc9JywgVkFMVUUsICcuY29sb3JbMF07JyxcclxuICAgICAgICAgICd9Jyk7XHJcbiAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gR0xfU0FNUExFUl9DVUJFKSB7XHJcbiAgICAgICAgc2NvcGUoXHJcbiAgICAgICAgICAnaWYoJywgVkFMVUUsICcmJicsIFZBTFVFLCAnLl9yZWdsVHlwZT09PVwiZnJhbWVidWZmZXJDdWJlXCIpeycsXHJcbiAgICAgICAgICBWQUxVRSwgJz0nLCBWQUxVRSwgJy5jb2xvclswXTsnLFxyXG4gICAgICAgICAgJ30nKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gcGVyZm9ybSB0eXBlIHZhbGlkYXRpb25cclxuICAgICAgY2hlY2skMS5vcHRpb25hbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgZnVuY3Rpb24gY2hlY2sgKHByZWQsIG1lc3NhZ2UpIHtcclxuICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsIHByZWQsXHJcbiAgICAgICAgICAgICdiYWQgZGF0YSBvciBtaXNzaW5nIGZvciB1bmlmb3JtIFwiJyArIG5hbWUgKyAnXCIuICAnICsgbWVzc2FnZSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBmdW5jdGlvbiBjaGVja1R5cGUgKHR5cGUpIHtcclxuICAgICAgICAgIGNoZWNrKFxyXG4gICAgICAgICAgICAndHlwZW9mICcgKyBWQUxVRSArICc9PT1cIicgKyB0eXBlICsgJ1wiJyxcclxuICAgICAgICAgICAgJ2ludmFsaWQgdHlwZSwgZXhwZWN0ZWQgJyArIHR5cGUpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgZnVuY3Rpb24gY2hlY2tWZWN0b3IgKG4sIHR5cGUpIHtcclxuICAgICAgICAgIGNoZWNrKFxyXG4gICAgICAgICAgICBzaGFyZWQuaXNBcnJheUxpa2UgKyAnKCcgKyBWQUxVRSArICcpJiYnICsgVkFMVUUgKyAnLmxlbmd0aD09PScgKyBuLFxyXG4gICAgICAgICAgICAnaW52YWxpZCB2ZWN0b3IsIHNob3VsZCBoYXZlIGxlbmd0aCAnICsgbiwgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgZnVuY3Rpb24gY2hlY2tUZXh0dXJlICh0YXJnZXQpIHtcclxuICAgICAgICAgIGNoZWNrKFxyXG4gICAgICAgICAgICAndHlwZW9mICcgKyBWQUxVRSArICc9PT1cImZ1bmN0aW9uXCImJicgK1xyXG4gICAgICAgICAgICBWQUxVRSArICcuX3JlZ2xUeXBlPT09XCJ0ZXh0dXJlJyArXHJcbiAgICAgICAgICAgICh0YXJnZXQgPT09IEdMX1RFWFRVUkVfMkQkMyA/ICcyZCcgOiAnQ3ViZScpICsgJ1wiJyxcclxuICAgICAgICAgICAgJ2ludmFsaWQgdGV4dHVyZSB0eXBlJywgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgc3dpdGNoICh0eXBlKSB7XHJcbiAgICAgICAgICBjYXNlIEdMX0lOVCQzOlxyXG4gICAgICAgICAgICBjaGVja1R5cGUoJ251bWJlcicpO1xyXG4gICAgICAgICAgICBicmVha1xyXG4gICAgICAgICAgY2FzZSBHTF9JTlRfVkVDMjpcclxuICAgICAgICAgICAgY2hlY2tWZWN0b3IoMiwgJ251bWJlcicpO1xyXG4gICAgICAgICAgICBicmVha1xyXG4gICAgICAgICAgY2FzZSBHTF9JTlRfVkVDMzpcclxuICAgICAgICAgICAgY2hlY2tWZWN0b3IoMywgJ251bWJlcicpO1xyXG4gICAgICAgICAgICBicmVha1xyXG4gICAgICAgICAgY2FzZSBHTF9JTlRfVkVDNDpcclxuICAgICAgICAgICAgY2hlY2tWZWN0b3IoNCwgJ251bWJlcicpO1xyXG4gICAgICAgICAgICBicmVha1xyXG4gICAgICAgICAgY2FzZSBHTF9GTE9BVCQ4OlxyXG4gICAgICAgICAgICBjaGVja1R5cGUoJ251bWJlcicpO1xyXG4gICAgICAgICAgICBicmVha1xyXG4gICAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMyOlxyXG4gICAgICAgICAgICBjaGVja1ZlY3RvcigyLCAnbnVtYmVyJyk7XHJcbiAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzM6XHJcbiAgICAgICAgICAgIGNoZWNrVmVjdG9yKDMsICdudW1iZXInKTtcclxuICAgICAgICAgICAgYnJlYWtcclxuICAgICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDNDpcclxuICAgICAgICAgICAgY2hlY2tWZWN0b3IoNCwgJ251bWJlcicpO1xyXG4gICAgICAgICAgICBicmVha1xyXG4gICAgICAgICAgY2FzZSBHTF9CT09MOlxyXG4gICAgICAgICAgICBjaGVja1R5cGUoJ2Jvb2xlYW4nKTtcclxuICAgICAgICAgICAgYnJlYWtcclxuICAgICAgICAgIGNhc2UgR0xfQk9PTF9WRUMyOlxyXG4gICAgICAgICAgICBjaGVja1ZlY3RvcigyLCAnYm9vbGVhbicpO1xyXG4gICAgICAgICAgICBicmVha1xyXG4gICAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzM6XHJcbiAgICAgICAgICAgIGNoZWNrVmVjdG9yKDMsICdib29sZWFuJyk7XHJcbiAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgICBjYXNlIEdMX0JPT0xfVkVDNDpcclxuICAgICAgICAgICAgY2hlY2tWZWN0b3IoNCwgJ2Jvb2xlYW4nKTtcclxuICAgICAgICAgICAgYnJlYWtcclxuICAgICAgICAgIGNhc2UgR0xfRkxPQVRfTUFUMjpcclxuICAgICAgICAgICAgY2hlY2tWZWN0b3IoNCwgJ251bWJlcicpO1xyXG4gICAgICAgICAgICBicmVha1xyXG4gICAgICAgICAgY2FzZSBHTF9GTE9BVF9NQVQzOlxyXG4gICAgICAgICAgICBjaGVja1ZlY3Rvcig5LCAnbnVtYmVyJyk7XHJcbiAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgICBjYXNlIEdMX0ZMT0FUX01BVDQ6XHJcbiAgICAgICAgICAgIGNoZWNrVmVjdG9yKDE2LCAnbnVtYmVyJyk7XHJcbiAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgICBjYXNlIEdMX1NBTVBMRVJfMkQ6XHJcbiAgICAgICAgICAgIGNoZWNrVGV4dHVyZShHTF9URVhUVVJFXzJEJDMpO1xyXG4gICAgICAgICAgICBicmVha1xyXG4gICAgICAgICAgY2FzZSBHTF9TQU1QTEVSX0NVQkU6XHJcbiAgICAgICAgICAgIGNoZWNrVGV4dHVyZShHTF9URVhUVVJFX0NVQkVfTUFQJDIpO1xyXG4gICAgICAgICAgICBicmVha1xyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcblxyXG4gICAgICB2YXIgdW5yb2xsID0gMTtcclxuICAgICAgc3dpdGNoICh0eXBlKSB7XHJcbiAgICAgICAgY2FzZSBHTF9TQU1QTEVSXzJEOlxyXG4gICAgICAgIGNhc2UgR0xfU0FNUExFUl9DVUJFOlxyXG4gICAgICAgICAgdmFyIFRFWCA9IHNjb3BlLmRlZihWQUxVRSwgJy5fdGV4dHVyZScpO1xyXG4gICAgICAgICAgc2NvcGUoR0wsICcudW5pZm9ybTFpKCcsIExPQ0FUSU9OLCAnLCcsIFRFWCwgJy5iaW5kKCkpOycpO1xyXG4gICAgICAgICAgc2NvcGUuZXhpdChURVgsICcudW5iaW5kKCk7Jyk7XHJcbiAgICAgICAgICBjb250aW51ZVxyXG5cclxuICAgICAgICBjYXNlIEdMX0lOVCQzOlxyXG4gICAgICAgIGNhc2UgR0xfQk9PTDpcclxuICAgICAgICAgIGluZml4ID0gJzFpJztcclxuICAgICAgICAgIGJyZWFrXHJcblxyXG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzI6XHJcbiAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzI6XHJcbiAgICAgICAgICBpbmZpeCA9ICcyaSc7XHJcbiAgICAgICAgICB1bnJvbGwgPSAyO1xyXG4gICAgICAgICAgYnJlYWtcclxuXHJcbiAgICAgICAgY2FzZSBHTF9JTlRfVkVDMzpcclxuICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMzpcclxuICAgICAgICAgIGluZml4ID0gJzNpJztcclxuICAgICAgICAgIHVucm9sbCA9IDM7XHJcbiAgICAgICAgICBicmVha1xyXG5cclxuICAgICAgICBjYXNlIEdMX0lOVF9WRUM0OlxyXG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUM0OlxyXG4gICAgICAgICAgaW5maXggPSAnNGknO1xyXG4gICAgICAgICAgdW5yb2xsID0gNDtcclxuICAgICAgICAgIGJyZWFrXHJcblxyXG4gICAgICAgIGNhc2UgR0xfRkxPQVQkODpcclxuICAgICAgICAgIGluZml4ID0gJzFmJztcclxuICAgICAgICAgIGJyZWFrXHJcblxyXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMjpcclxuICAgICAgICAgIGluZml4ID0gJzJmJztcclxuICAgICAgICAgIHVucm9sbCA9IDI7XHJcbiAgICAgICAgICBicmVha1xyXG5cclxuICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzM6XHJcbiAgICAgICAgICBpbmZpeCA9ICczZic7XHJcbiAgICAgICAgICB1bnJvbGwgPSAzO1xyXG4gICAgICAgICAgYnJlYWtcclxuXHJcbiAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUM0OlxyXG4gICAgICAgICAgaW5maXggPSAnNGYnO1xyXG4gICAgICAgICAgdW5yb2xsID0gNDtcclxuICAgICAgICAgIGJyZWFrXHJcblxyXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfTUFUMjpcclxuICAgICAgICAgIGluZml4ID0gJ01hdHJpeDJmdic7XHJcbiAgICAgICAgICBicmVha1xyXG5cclxuICAgICAgICBjYXNlIEdMX0ZMT0FUX01BVDM6XHJcbiAgICAgICAgICBpbmZpeCA9ICdNYXRyaXgzZnYnO1xyXG4gICAgICAgICAgYnJlYWtcclxuXHJcbiAgICAgICAgY2FzZSBHTF9GTE9BVF9NQVQ0OlxyXG4gICAgICAgICAgaW5maXggPSAnTWF0cml4NGZ2JztcclxuICAgICAgICAgIGJyZWFrXHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHNjb3BlKEdMLCAnLnVuaWZvcm0nLCBpbmZpeCwgJygnLCBMT0NBVElPTiwgJywnKTtcclxuICAgICAgaWYgKGluZml4LmNoYXJBdCgwKSA9PT0gJ00nKSB7XHJcbiAgICAgICAgdmFyIG1hdFNpemUgPSBNYXRoLnBvdyh0eXBlIC0gR0xfRkxPQVRfTUFUMiArIDIsIDIpO1xyXG4gICAgICAgIHZhciBTVE9SQUdFID0gZW52Lmdsb2JhbC5kZWYoJ25ldyBGbG9hdDMyQXJyYXkoJywgbWF0U2l6ZSwgJyknKTtcclxuICAgICAgICBzY29wZShcclxuICAgICAgICAgICdmYWxzZSwoQXJyYXkuaXNBcnJheSgnLCBWQUxVRSwgJyl8fCcsIFZBTFVFLCAnIGluc3RhbmNlb2YgRmxvYXQzMkFycmF5KT8nLCBWQUxVRSwgJzooJyxcclxuICAgICAgICAgIGxvb3AobWF0U2l6ZSwgZnVuY3Rpb24gKGkpIHtcclxuICAgICAgICAgICAgcmV0dXJuIFNUT1JBR0UgKyAnWycgKyBpICsgJ109JyArIFZBTFVFICsgJ1snICsgaSArICddJ1xyXG4gICAgICAgICAgfSksICcsJywgU1RPUkFHRSwgJyknKTtcclxuICAgICAgfSBlbHNlIGlmICh1bnJvbGwgPiAxKSB7XHJcbiAgICAgICAgc2NvcGUobG9vcCh1bnJvbGwsIGZ1bmN0aW9uIChpKSB7XHJcbiAgICAgICAgICByZXR1cm4gVkFMVUUgKyAnWycgKyBpICsgJ10nXHJcbiAgICAgICAgfSkpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHNjb3BlKFZBTFVFKTtcclxuICAgICAgfVxyXG4gICAgICBzY29wZSgnKTsnKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGVtaXREcmF3IChlbnYsIG91dGVyLCBpbm5lciwgYXJncykge1xyXG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWQ7XHJcbiAgICB2YXIgR0wgPSBzaGFyZWQuZ2w7XHJcbiAgICB2YXIgRFJBV19TVEFURSA9IHNoYXJlZC5kcmF3O1xyXG5cclxuICAgIHZhciBkcmF3T3B0aW9ucyA9IGFyZ3MuZHJhdztcclxuXHJcbiAgICBmdW5jdGlvbiBlbWl0RWxlbWVudHMgKCkge1xyXG4gICAgICB2YXIgZGVmbiA9IGRyYXdPcHRpb25zLmVsZW1lbnRzO1xyXG4gICAgICB2YXIgRUxFTUVOVFM7XHJcbiAgICAgIHZhciBzY29wZSA9IG91dGVyO1xyXG4gICAgICBpZiAoZGVmbikge1xyXG4gICAgICAgIGlmICgoZGVmbi5jb250ZXh0RGVwICYmIGFyZ3MuY29udGV4dER5bmFtaWMpIHx8IGRlZm4ucHJvcERlcCkge1xyXG4gICAgICAgICAgc2NvcGUgPSBpbm5lcjtcclxuICAgICAgICB9XHJcbiAgICAgICAgRUxFTUVOVFMgPSBkZWZuLmFwcGVuZChlbnYsIHNjb3BlKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBFTEVNRU5UUyA9IHNjb3BlLmRlZihEUkFXX1NUQVRFLCAnLicsIFNfRUxFTUVOVFMpO1xyXG4gICAgICB9XHJcbiAgICAgIGlmIChFTEVNRU5UUykge1xyXG4gICAgICAgIHNjb3BlKFxyXG4gICAgICAgICAgJ2lmKCcgKyBFTEVNRU5UUyArICcpJyArXHJcbiAgICAgICAgICBHTCArICcuYmluZEJ1ZmZlcignICsgR0xfRUxFTUVOVF9BUlJBWV9CVUZGRVIkMSArICcsJyArIEVMRU1FTlRTICsgJy5idWZmZXIuYnVmZmVyKTsnKTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gRUxFTUVOVFNcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBlbWl0Q291bnQgKCkge1xyXG4gICAgICB2YXIgZGVmbiA9IGRyYXdPcHRpb25zLmNvdW50O1xyXG4gICAgICB2YXIgQ09VTlQ7XHJcbiAgICAgIHZhciBzY29wZSA9IG91dGVyO1xyXG4gICAgICBpZiAoZGVmbikge1xyXG4gICAgICAgIGlmICgoZGVmbi5jb250ZXh0RGVwICYmIGFyZ3MuY29udGV4dER5bmFtaWMpIHx8IGRlZm4ucHJvcERlcCkge1xyXG4gICAgICAgICAgc2NvcGUgPSBpbm5lcjtcclxuICAgICAgICB9XHJcbiAgICAgICAgQ09VTlQgPSBkZWZuLmFwcGVuZChlbnYsIHNjb3BlKTtcclxuICAgICAgICBjaGVjayQxLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgIGlmIChkZWZuLk1JU1NJTkcpIHtcclxuICAgICAgICAgICAgZW52LmFzc2VydChvdXRlciwgJ2ZhbHNlJywgJ21pc3NpbmcgdmVydGV4IGNvdW50Jyk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBpZiAoZGVmbi5EWU5BTUlDKSB7XHJcbiAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsIENPVU5UICsgJz49MCcsICdtaXNzaW5nIHZlcnRleCBjb3VudCcpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIENPVU5UID0gc2NvcGUuZGVmKERSQVdfU1RBVEUsICcuJywgU19DT1VOVCk7XHJcbiAgICAgICAgY2hlY2skMS5vcHRpb25hbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLCBDT1VOVCArICc+PTAnLCAnbWlzc2luZyB2ZXJ0ZXggY291bnQnKTtcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gQ09VTlRcclxuICAgIH1cclxuXHJcbiAgICB2YXIgRUxFTUVOVFMgPSBlbWl0RWxlbWVudHMoKTtcclxuICAgIGZ1bmN0aW9uIGVtaXRWYWx1ZSAobmFtZSkge1xyXG4gICAgICB2YXIgZGVmbiA9IGRyYXdPcHRpb25zW25hbWVdO1xyXG4gICAgICBpZiAoZGVmbikge1xyXG4gICAgICAgIGlmICgoZGVmbi5jb250ZXh0RGVwICYmIGFyZ3MuY29udGV4dER5bmFtaWMpIHx8IGRlZm4ucHJvcERlcCkge1xyXG4gICAgICAgICAgcmV0dXJuIGRlZm4uYXBwZW5kKGVudiwgaW5uZXIpXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIHJldHVybiBkZWZuLmFwcGVuZChlbnYsIG91dGVyKVxyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICByZXR1cm4gb3V0ZXIuZGVmKERSQVdfU1RBVEUsICcuJywgbmFtZSlcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHZhciBQUklNSVRJVkUgPSBlbWl0VmFsdWUoU19QUklNSVRJVkUpO1xyXG4gICAgdmFyIE9GRlNFVCA9IGVtaXRWYWx1ZShTX09GRlNFVCk7XHJcblxyXG4gICAgdmFyIENPVU5UID0gZW1pdENvdW50KCk7XHJcbiAgICBpZiAodHlwZW9mIENPVU5UID09PSAnbnVtYmVyJykge1xyXG4gICAgICBpZiAoQ09VTlQgPT09IDApIHtcclxuICAgICAgICByZXR1cm5cclxuICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgaW5uZXIoJ2lmKCcsIENPVU5ULCAnKXsnKTtcclxuICAgICAgaW5uZXIuZXhpdCgnfScpO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBJTlNUQU5DRVMsIEVYVF9JTlNUQU5DSU5HO1xyXG4gICAgaWYgKGV4dEluc3RhbmNpbmcpIHtcclxuICAgICAgSU5TVEFOQ0VTID0gZW1pdFZhbHVlKFNfSU5TVEFOQ0VTKTtcclxuICAgICAgRVhUX0lOU1RBTkNJTkcgPSBlbnYuaW5zdGFuY2luZztcclxuICAgIH1cclxuXHJcbiAgICB2YXIgRUxFTUVOVF9UWVBFID0gRUxFTUVOVFMgKyAnLnR5cGUnO1xyXG5cclxuICAgIHZhciBlbGVtZW50c1N0YXRpYyA9IGRyYXdPcHRpb25zLmVsZW1lbnRzICYmIGlzU3RhdGljKGRyYXdPcHRpb25zLmVsZW1lbnRzKTtcclxuXHJcbiAgICBmdW5jdGlvbiBlbWl0SW5zdGFuY2luZyAoKSB7XHJcbiAgICAgIGZ1bmN0aW9uIGRyYXdFbGVtZW50cyAoKSB7XHJcbiAgICAgICAgaW5uZXIoRVhUX0lOU1RBTkNJTkcsICcuZHJhd0VsZW1lbnRzSW5zdGFuY2VkQU5HTEUoJywgW1xyXG4gICAgICAgICAgUFJJTUlUSVZFLFxyXG4gICAgICAgICAgQ09VTlQsXHJcbiAgICAgICAgICBFTEVNRU5UX1RZUEUsXHJcbiAgICAgICAgICBPRkZTRVQgKyAnPDwoKCcgKyBFTEVNRU5UX1RZUEUgKyAnLScgKyBHTF9VTlNJR05FRF9CWVRFJDggKyAnKT4+MSknLFxyXG4gICAgICAgICAgSU5TVEFOQ0VTXHJcbiAgICAgICAgXSwgJyk7Jyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGZ1bmN0aW9uIGRyYXdBcnJheXMgKCkge1xyXG4gICAgICAgIGlubmVyKEVYVF9JTlNUQU5DSU5HLCAnLmRyYXdBcnJheXNJbnN0YW5jZWRBTkdMRSgnLFxyXG4gICAgICAgICAgW1BSSU1JVElWRSwgT0ZGU0VULCBDT1VOVCwgSU5TVEFOQ0VTXSwgJyk7Jyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmIChFTEVNRU5UUykge1xyXG4gICAgICAgIGlmICghZWxlbWVudHNTdGF0aWMpIHtcclxuICAgICAgICAgIGlubmVyKCdpZignLCBFTEVNRU5UUywgJyl7Jyk7XHJcbiAgICAgICAgICBkcmF3RWxlbWVudHMoKTtcclxuICAgICAgICAgIGlubmVyKCd9ZWxzZXsnKTtcclxuICAgICAgICAgIGRyYXdBcnJheXMoKTtcclxuICAgICAgICAgIGlubmVyKCd9Jyk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGRyYXdFbGVtZW50cygpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBkcmF3QXJyYXlzKCk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBlbWl0UmVndWxhciAoKSB7XHJcbiAgICAgIGZ1bmN0aW9uIGRyYXdFbGVtZW50cyAoKSB7XHJcbiAgICAgICAgaW5uZXIoR0wgKyAnLmRyYXdFbGVtZW50cygnICsgW1xyXG4gICAgICAgICAgUFJJTUlUSVZFLFxyXG4gICAgICAgICAgQ09VTlQsXHJcbiAgICAgICAgICBFTEVNRU5UX1RZUEUsXHJcbiAgICAgICAgICBPRkZTRVQgKyAnPDwoKCcgKyBFTEVNRU5UX1RZUEUgKyAnLScgKyBHTF9VTlNJR05FRF9CWVRFJDggKyAnKT4+MSknXHJcbiAgICAgICAgXSArICcpOycpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBmdW5jdGlvbiBkcmF3QXJyYXlzICgpIHtcclxuICAgICAgICBpbm5lcihHTCArICcuZHJhd0FycmF5cygnICsgW1BSSU1JVElWRSwgT0ZGU0VULCBDT1VOVF0gKyAnKTsnKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKEVMRU1FTlRTKSB7XHJcbiAgICAgICAgaWYgKCFlbGVtZW50c1N0YXRpYykge1xyXG4gICAgICAgICAgaW5uZXIoJ2lmKCcsIEVMRU1FTlRTLCAnKXsnKTtcclxuICAgICAgICAgIGRyYXdFbGVtZW50cygpO1xyXG4gICAgICAgICAgaW5uZXIoJ31lbHNleycpO1xyXG4gICAgICAgICAgZHJhd0FycmF5cygpO1xyXG4gICAgICAgICAgaW5uZXIoJ30nKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgZHJhd0VsZW1lbnRzKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGRyYXdBcnJheXMoKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmIChleHRJbnN0YW5jaW5nICYmICh0eXBlb2YgSU5TVEFOQ0VTICE9PSAnbnVtYmVyJyB8fCBJTlNUQU5DRVMgPj0gMCkpIHtcclxuICAgICAgaWYgKHR5cGVvZiBJTlNUQU5DRVMgPT09ICdzdHJpbmcnKSB7XHJcbiAgICAgICAgaW5uZXIoJ2lmKCcsIElOU1RBTkNFUywgJz4wKXsnKTtcclxuICAgICAgICBlbWl0SW5zdGFuY2luZygpO1xyXG4gICAgICAgIGlubmVyKCd9ZWxzZSBpZignLCBJTlNUQU5DRVMsICc8MCl7Jyk7XHJcbiAgICAgICAgZW1pdFJlZ3VsYXIoKTtcclxuICAgICAgICBpbm5lcignfScpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGVtaXRJbnN0YW5jaW5nKCk7XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGVtaXRSZWd1bGFyKCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBjcmVhdGVCb2R5IChlbWl0Qm9keSwgcGFyZW50RW52LCBhcmdzLCBwcm9ncmFtLCBjb3VudCkge1xyXG4gICAgdmFyIGVudiA9IGNyZWF0ZVJFR0xFbnZpcm9ubWVudCgpO1xyXG4gICAgdmFyIHNjb3BlID0gZW52LnByb2MoJ2JvZHknLCBjb3VudCk7XHJcbiAgICBjaGVjayQxLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgZW52LmNvbW1hbmRTdHIgPSBwYXJlbnRFbnYuY29tbWFuZFN0cjtcclxuICAgICAgZW52LmNvbW1hbmQgPSBlbnYubGluayhwYXJlbnRFbnYuY29tbWFuZFN0cik7XHJcbiAgICB9KTtcclxuICAgIGlmIChleHRJbnN0YW5jaW5nKSB7XHJcbiAgICAgIGVudi5pbnN0YW5jaW5nID0gc2NvcGUuZGVmKFxyXG4gICAgICAgIGVudi5zaGFyZWQuZXh0ZW5zaW9ucywgJy5hbmdsZV9pbnN0YW5jZWRfYXJyYXlzJyk7XHJcbiAgICB9XHJcbiAgICBlbWl0Qm9keShlbnYsIHNjb3BlLCBhcmdzLCBwcm9ncmFtKTtcclxuICAgIHJldHVybiBlbnYuY29tcGlsZSgpLmJvZHlcclxuICB9XHJcblxyXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gIC8vIERSQVcgUFJPQ1xyXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gIGZ1bmN0aW9uIGVtaXREcmF3Qm9keSAoZW52LCBkcmF3LCBhcmdzLCBwcm9ncmFtKSB7XHJcbiAgICBpbmplY3RFeHRlbnNpb25zKGVudiwgZHJhdyk7XHJcbiAgICBlbWl0QXR0cmlidXRlcyhlbnYsIGRyYXcsIGFyZ3MsIHByb2dyYW0uYXR0cmlidXRlcywgZnVuY3Rpb24gKCkge1xyXG4gICAgICByZXR1cm4gdHJ1ZVxyXG4gICAgfSk7XHJcbiAgICBlbWl0VW5pZm9ybXMoZW52LCBkcmF3LCBhcmdzLCBwcm9ncmFtLnVuaWZvcm1zLCBmdW5jdGlvbiAoKSB7XHJcbiAgICAgIHJldHVybiB0cnVlXHJcbiAgICB9KTtcclxuICAgIGVtaXREcmF3KGVudiwgZHJhdywgZHJhdywgYXJncyk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBlbWl0RHJhd1Byb2MgKGVudiwgYXJncykge1xyXG4gICAgdmFyIGRyYXcgPSBlbnYucHJvYygnZHJhdycsIDEpO1xyXG5cclxuICAgIGluamVjdEV4dGVuc2lvbnMoZW52LCBkcmF3KTtcclxuXHJcbiAgICBlbWl0Q29udGV4dChlbnYsIGRyYXcsIGFyZ3MuY29udGV4dCk7XHJcbiAgICBlbWl0UG9sbEZyYW1lYnVmZmVyKGVudiwgZHJhdywgYXJncy5mcmFtZWJ1ZmZlcik7XHJcblxyXG4gICAgZW1pdFBvbGxTdGF0ZShlbnYsIGRyYXcsIGFyZ3MpO1xyXG4gICAgZW1pdFNldE9wdGlvbnMoZW52LCBkcmF3LCBhcmdzLnN0YXRlKTtcclxuXHJcbiAgICBlbWl0UHJvZmlsZShlbnYsIGRyYXcsIGFyZ3MsIGZhbHNlLCB0cnVlKTtcclxuXHJcbiAgICB2YXIgcHJvZ3JhbSA9IGFyZ3Muc2hhZGVyLnByb2dWYXIuYXBwZW5kKGVudiwgZHJhdyk7XHJcbiAgICBkcmF3KGVudi5zaGFyZWQuZ2wsICcudXNlUHJvZ3JhbSgnLCBwcm9ncmFtLCAnLnByb2dyYW0pOycpO1xyXG5cclxuICAgIGlmIChhcmdzLnNoYWRlci5wcm9ncmFtKSB7XHJcbiAgICAgIGVtaXREcmF3Qm9keShlbnYsIGRyYXcsIGFyZ3MsIGFyZ3Muc2hhZGVyLnByb2dyYW0pO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdmFyIGRyYXdDYWNoZSA9IGVudi5nbG9iYWwuZGVmKCd7fScpO1xyXG4gICAgICB2YXIgUFJPR19JRCA9IGRyYXcuZGVmKHByb2dyYW0sICcuaWQnKTtcclxuICAgICAgdmFyIENBQ0hFRF9QUk9DID0gZHJhdy5kZWYoZHJhd0NhY2hlLCAnWycsIFBST0dfSUQsICddJyk7XHJcbiAgICAgIGRyYXcoXHJcbiAgICAgICAgZW52LmNvbmQoQ0FDSEVEX1BST0MpXHJcbiAgICAgICAgICAudGhlbihDQUNIRURfUFJPQywgJy5jYWxsKHRoaXMsYTApOycpXHJcbiAgICAgICAgICAuZWxzZShcclxuICAgICAgICAgICAgQ0FDSEVEX1BST0MsICc9JywgZHJhd0NhY2hlLCAnWycsIFBST0dfSUQsICddPScsXHJcbiAgICAgICAgICAgIGVudi5saW5rKGZ1bmN0aW9uIChwcm9ncmFtKSB7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIGNyZWF0ZUJvZHkoZW1pdERyYXdCb2R5LCBlbnYsIGFyZ3MsIHByb2dyYW0sIDEpXHJcbiAgICAgICAgICAgIH0pLCAnKCcsIHByb2dyYW0sICcpOycsXHJcbiAgICAgICAgICAgIENBQ0hFRF9QUk9DLCAnLmNhbGwodGhpcyxhMCk7JykpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChPYmplY3Qua2V5cyhhcmdzLnN0YXRlKS5sZW5ndGggPiAwKSB7XHJcbiAgICAgIGRyYXcoZW52LnNoYXJlZC5jdXJyZW50LCAnLmRpcnR5PXRydWU7Jyk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAvLyBCQVRDSCBQUk9DXHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcblxyXG4gIGZ1bmN0aW9uIGVtaXRCYXRjaER5bmFtaWNTaGFkZXJCb2R5IChlbnYsIHNjb3BlLCBhcmdzLCBwcm9ncmFtKSB7XHJcbiAgICBlbnYuYmF0Y2hJZCA9ICdhMSc7XHJcblxyXG4gICAgaW5qZWN0RXh0ZW5zaW9ucyhlbnYsIHNjb3BlKTtcclxuXHJcbiAgICBmdW5jdGlvbiBhbGwgKCkge1xyXG4gICAgICByZXR1cm4gdHJ1ZVxyXG4gICAgfVxyXG5cclxuICAgIGVtaXRBdHRyaWJ1dGVzKGVudiwgc2NvcGUsIGFyZ3MsIHByb2dyYW0uYXR0cmlidXRlcywgYWxsKTtcclxuICAgIGVtaXRVbmlmb3JtcyhlbnYsIHNjb3BlLCBhcmdzLCBwcm9ncmFtLnVuaWZvcm1zLCBhbGwpO1xyXG4gICAgZW1pdERyYXcoZW52LCBzY29wZSwgc2NvcGUsIGFyZ3MpO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZW1pdEJhdGNoQm9keSAoZW52LCBzY29wZSwgYXJncywgcHJvZ3JhbSkge1xyXG4gICAgaW5qZWN0RXh0ZW5zaW9ucyhlbnYsIHNjb3BlKTtcclxuXHJcbiAgICB2YXIgY29udGV4dER5bmFtaWMgPSBhcmdzLmNvbnRleHREZXA7XHJcblxyXG4gICAgdmFyIEJBVENIX0lEID0gc2NvcGUuZGVmKCk7XHJcbiAgICB2YXIgUFJPUF9MSVNUID0gJ2EwJztcclxuICAgIHZhciBOVU1fUFJPUFMgPSAnYTEnO1xyXG4gICAgdmFyIFBST1BTID0gc2NvcGUuZGVmKCk7XHJcbiAgICBlbnYuc2hhcmVkLnByb3BzID0gUFJPUFM7XHJcbiAgICBlbnYuYmF0Y2hJZCA9IEJBVENIX0lEO1xyXG5cclxuICAgIHZhciBvdXRlciA9IGVudi5zY29wZSgpO1xyXG4gICAgdmFyIGlubmVyID0gZW52LnNjb3BlKCk7XHJcblxyXG4gICAgc2NvcGUoXHJcbiAgICAgIG91dGVyLmVudHJ5LFxyXG4gICAgICAnZm9yKCcsIEJBVENIX0lELCAnPTA7JywgQkFUQ0hfSUQsICc8JywgTlVNX1BST1BTLCAnOysrJywgQkFUQ0hfSUQsICcpeycsXHJcbiAgICAgIFBST1BTLCAnPScsIFBST1BfTElTVCwgJ1snLCBCQVRDSF9JRCwgJ107JyxcclxuICAgICAgaW5uZXIsXHJcbiAgICAgICd9JyxcclxuICAgICAgb3V0ZXIuZXhpdCk7XHJcblxyXG4gICAgZnVuY3Rpb24gaXNJbm5lckRlZm4gKGRlZm4pIHtcclxuICAgICAgcmV0dXJuICgoZGVmbi5jb250ZXh0RGVwICYmIGNvbnRleHREeW5hbWljKSB8fCBkZWZuLnByb3BEZXApXHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gaXNPdXRlckRlZm4gKGRlZm4pIHtcclxuICAgICAgcmV0dXJuICFpc0lubmVyRGVmbihkZWZuKVxyXG4gICAgfVxyXG5cclxuICAgIGlmIChhcmdzLm5lZWRzQ29udGV4dCkge1xyXG4gICAgICBlbWl0Q29udGV4dChlbnYsIGlubmVyLCBhcmdzLmNvbnRleHQpO1xyXG4gICAgfVxyXG4gICAgaWYgKGFyZ3MubmVlZHNGcmFtZWJ1ZmZlcikge1xyXG4gICAgICBlbWl0UG9sbEZyYW1lYnVmZmVyKGVudiwgaW5uZXIsIGFyZ3MuZnJhbWVidWZmZXIpO1xyXG4gICAgfVxyXG4gICAgZW1pdFNldE9wdGlvbnMoZW52LCBpbm5lciwgYXJncy5zdGF0ZSwgaXNJbm5lckRlZm4pO1xyXG5cclxuICAgIGlmIChhcmdzLnByb2ZpbGUgJiYgaXNJbm5lckRlZm4oYXJncy5wcm9maWxlKSkge1xyXG4gICAgICBlbWl0UHJvZmlsZShlbnYsIGlubmVyLCBhcmdzLCBmYWxzZSwgdHJ1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCFwcm9ncmFtKSB7XHJcbiAgICAgIHZhciBwcm9nQ2FjaGUgPSBlbnYuZ2xvYmFsLmRlZigne30nKTtcclxuICAgICAgdmFyIFBST0dSQU0gPSBhcmdzLnNoYWRlci5wcm9nVmFyLmFwcGVuZChlbnYsIGlubmVyKTtcclxuICAgICAgdmFyIFBST0dfSUQgPSBpbm5lci5kZWYoUFJPR1JBTSwgJy5pZCcpO1xyXG4gICAgICB2YXIgQ0FDSEVEX1BST0MgPSBpbm5lci5kZWYocHJvZ0NhY2hlLCAnWycsIFBST0dfSUQsICddJyk7XHJcbiAgICAgIGlubmVyKFxyXG4gICAgICAgIGVudi5zaGFyZWQuZ2wsICcudXNlUHJvZ3JhbSgnLCBQUk9HUkFNLCAnLnByb2dyYW0pOycsXHJcbiAgICAgICAgJ2lmKCEnLCBDQUNIRURfUFJPQywgJyl7JyxcclxuICAgICAgICBDQUNIRURfUFJPQywgJz0nLCBwcm9nQ2FjaGUsICdbJywgUFJPR19JRCwgJ109JyxcclxuICAgICAgICBlbnYubGluayhmdW5jdGlvbiAocHJvZ3JhbSkge1xyXG4gICAgICAgICAgcmV0dXJuIGNyZWF0ZUJvZHkoXHJcbiAgICAgICAgICAgIGVtaXRCYXRjaER5bmFtaWNTaGFkZXJCb2R5LCBlbnYsIGFyZ3MsIHByb2dyYW0sIDIpXHJcbiAgICAgICAgfSksICcoJywgUFJPR1JBTSwgJyk7fScsXHJcbiAgICAgICAgQ0FDSEVEX1BST0MsICcuY2FsbCh0aGlzLGEwWycsIEJBVENIX0lELCAnXSwnLCBCQVRDSF9JRCwgJyk7Jyk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBlbWl0QXR0cmlidXRlcyhlbnYsIG91dGVyLCBhcmdzLCBwcm9ncmFtLmF0dHJpYnV0ZXMsIGlzT3V0ZXJEZWZuKTtcclxuICAgICAgZW1pdEF0dHJpYnV0ZXMoZW52LCBpbm5lciwgYXJncywgcHJvZ3JhbS5hdHRyaWJ1dGVzLCBpc0lubmVyRGVmbik7XHJcbiAgICAgIGVtaXRVbmlmb3JtcyhlbnYsIG91dGVyLCBhcmdzLCBwcm9ncmFtLnVuaWZvcm1zLCBpc091dGVyRGVmbik7XHJcbiAgICAgIGVtaXRVbmlmb3JtcyhlbnYsIGlubmVyLCBhcmdzLCBwcm9ncmFtLnVuaWZvcm1zLCBpc0lubmVyRGVmbik7XHJcbiAgICAgIGVtaXREcmF3KGVudiwgb3V0ZXIsIGlubmVyLCBhcmdzKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGVtaXRCYXRjaFByb2MgKGVudiwgYXJncykge1xyXG4gICAgdmFyIGJhdGNoID0gZW52LnByb2MoJ2JhdGNoJywgMik7XHJcbiAgICBlbnYuYmF0Y2hJZCA9ICcwJztcclxuXHJcbiAgICBpbmplY3RFeHRlbnNpb25zKGVudiwgYmF0Y2gpO1xyXG5cclxuICAgIC8vIENoZWNrIGlmIGFueSBjb250ZXh0IHZhcmlhYmxlcyBkZXBlbmQgb24gcHJvcHNcclxuICAgIHZhciBjb250ZXh0RHluYW1pYyA9IGZhbHNlO1xyXG4gICAgdmFyIG5lZWRzQ29udGV4dCA9IHRydWU7XHJcbiAgICBPYmplY3Qua2V5cyhhcmdzLmNvbnRleHQpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcclxuICAgICAgY29udGV4dER5bmFtaWMgPSBjb250ZXh0RHluYW1pYyB8fCBhcmdzLmNvbnRleHRbbmFtZV0ucHJvcERlcDtcclxuICAgIH0pO1xyXG4gICAgaWYgKCFjb250ZXh0RHluYW1pYykge1xyXG4gICAgICBlbWl0Q29udGV4dChlbnYsIGJhdGNoLCBhcmdzLmNvbnRleHQpO1xyXG4gICAgICBuZWVkc0NvbnRleHQgPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBmcmFtZWJ1ZmZlciBzdGF0ZSBhZmZlY3RzIGZyYW1lYnVmZmVyV2lkdGgvaGVpZ2h0IGNvbnRleHQgdmFyc1xyXG4gICAgdmFyIGZyYW1lYnVmZmVyID0gYXJncy5mcmFtZWJ1ZmZlcjtcclxuICAgIHZhciBuZWVkc0ZyYW1lYnVmZmVyID0gZmFsc2U7XHJcbiAgICBpZiAoZnJhbWVidWZmZXIpIHtcclxuICAgICAgaWYgKGZyYW1lYnVmZmVyLnByb3BEZXApIHtcclxuICAgICAgICBjb250ZXh0RHluYW1pYyA9IG5lZWRzRnJhbWVidWZmZXIgPSB0cnVlO1xyXG4gICAgICB9IGVsc2UgaWYgKGZyYW1lYnVmZmVyLmNvbnRleHREZXAgJiYgY29udGV4dER5bmFtaWMpIHtcclxuICAgICAgICBuZWVkc0ZyYW1lYnVmZmVyID0gdHJ1ZTtcclxuICAgICAgfVxyXG4gICAgICBpZiAoIW5lZWRzRnJhbWVidWZmZXIpIHtcclxuICAgICAgICBlbWl0UG9sbEZyYW1lYnVmZmVyKGVudiwgYmF0Y2gsIGZyYW1lYnVmZmVyKTtcclxuICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgZW1pdFBvbGxGcmFtZWJ1ZmZlcihlbnYsIGJhdGNoLCBudWxsKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyB2aWV3cG9ydCBpcyB3ZWlyZCBiZWNhdXNlIGl0IGNhbiBhZmZlY3QgY29udGV4dCB2YXJzXHJcbiAgICBpZiAoYXJncy5zdGF0ZS52aWV3cG9ydCAmJiBhcmdzLnN0YXRlLnZpZXdwb3J0LnByb3BEZXApIHtcclxuICAgICAgY29udGV4dER5bmFtaWMgPSB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGlzSW5uZXJEZWZuIChkZWZuKSB7XHJcbiAgICAgIHJldHVybiAoZGVmbi5jb250ZXh0RGVwICYmIGNvbnRleHREeW5hbWljKSB8fCBkZWZuLnByb3BEZXBcclxuICAgIH1cclxuXHJcbiAgICAvLyBzZXQgd2ViZ2wgb3B0aW9uc1xyXG4gICAgZW1pdFBvbGxTdGF0ZShlbnYsIGJhdGNoLCBhcmdzKTtcclxuICAgIGVtaXRTZXRPcHRpb25zKGVudiwgYmF0Y2gsIGFyZ3Muc3RhdGUsIGZ1bmN0aW9uIChkZWZuKSB7XHJcbiAgICAgIHJldHVybiAhaXNJbm5lckRlZm4oZGVmbilcclxuICAgIH0pO1xyXG5cclxuICAgIGlmICghYXJncy5wcm9maWxlIHx8ICFpc0lubmVyRGVmbihhcmdzLnByb2ZpbGUpKSB7XHJcbiAgICAgIGVtaXRQcm9maWxlKGVudiwgYmF0Y2gsIGFyZ3MsIGZhbHNlLCAnYTEnKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBTYXZlIHRoZXNlIHZhbHVlcyB0byBhcmdzIHNvIHRoYXQgdGhlIGJhdGNoIGJvZHkgcm91dGluZSBjYW4gdXNlIHRoZW1cclxuICAgIGFyZ3MuY29udGV4dERlcCA9IGNvbnRleHREeW5hbWljO1xyXG4gICAgYXJncy5uZWVkc0NvbnRleHQgPSBuZWVkc0NvbnRleHQ7XHJcbiAgICBhcmdzLm5lZWRzRnJhbWVidWZmZXIgPSBuZWVkc0ZyYW1lYnVmZmVyO1xyXG5cclxuICAgIC8vIGRldGVybWluZSBpZiBzaGFkZXIgaXMgZHluYW1pY1xyXG4gICAgdmFyIHByb2dEZWZuID0gYXJncy5zaGFkZXIucHJvZ1ZhcjtcclxuICAgIGlmICgocHJvZ0RlZm4uY29udGV4dERlcCAmJiBjb250ZXh0RHluYW1pYykgfHwgcHJvZ0RlZm4ucHJvcERlcCkge1xyXG4gICAgICBlbWl0QmF0Y2hCb2R5KFxyXG4gICAgICAgIGVudixcclxuICAgICAgICBiYXRjaCxcclxuICAgICAgICBhcmdzLFxyXG4gICAgICAgIG51bGwpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdmFyIFBST0dSQU0gPSBwcm9nRGVmbi5hcHBlbmQoZW52LCBiYXRjaCk7XHJcbiAgICAgIGJhdGNoKGVudi5zaGFyZWQuZ2wsICcudXNlUHJvZ3JhbSgnLCBQUk9HUkFNLCAnLnByb2dyYW0pOycpO1xyXG4gICAgICBpZiAoYXJncy5zaGFkZXIucHJvZ3JhbSkge1xyXG4gICAgICAgIGVtaXRCYXRjaEJvZHkoXHJcbiAgICAgICAgICBlbnYsXHJcbiAgICAgICAgICBiYXRjaCxcclxuICAgICAgICAgIGFyZ3MsXHJcbiAgICAgICAgICBhcmdzLnNoYWRlci5wcm9ncmFtKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB2YXIgYmF0Y2hDYWNoZSA9IGVudi5nbG9iYWwuZGVmKCd7fScpO1xyXG4gICAgICAgIHZhciBQUk9HX0lEID0gYmF0Y2guZGVmKFBST0dSQU0sICcuaWQnKTtcclxuICAgICAgICB2YXIgQ0FDSEVEX1BST0MgPSBiYXRjaC5kZWYoYmF0Y2hDYWNoZSwgJ1snLCBQUk9HX0lELCAnXScpO1xyXG4gICAgICAgIGJhdGNoKFxyXG4gICAgICAgICAgZW52LmNvbmQoQ0FDSEVEX1BST0MpXHJcbiAgICAgICAgICAgIC50aGVuKENBQ0hFRF9QUk9DLCAnLmNhbGwodGhpcyxhMCxhMSk7JylcclxuICAgICAgICAgICAgLmVsc2UoXHJcbiAgICAgICAgICAgICAgQ0FDSEVEX1BST0MsICc9JywgYmF0Y2hDYWNoZSwgJ1snLCBQUk9HX0lELCAnXT0nLFxyXG4gICAgICAgICAgICAgIGVudi5saW5rKGZ1bmN0aW9uIChwcm9ncmFtKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gY3JlYXRlQm9keShlbWl0QmF0Y2hCb2R5LCBlbnYsIGFyZ3MsIHByb2dyYW0sIDIpXHJcbiAgICAgICAgICAgICAgfSksICcoJywgUFJPR1JBTSwgJyk7JyxcclxuICAgICAgICAgICAgICBDQUNIRURfUFJPQywgJy5jYWxsKHRoaXMsYTAsYTEpOycpKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmIChPYmplY3Qua2V5cyhhcmdzLnN0YXRlKS5sZW5ndGggPiAwKSB7XHJcbiAgICAgIGJhdGNoKGVudi5zaGFyZWQuY3VycmVudCwgJy5kaXJ0eT10cnVlOycpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgLy8gU0NPUEUgQ09NTUFORFxyXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gIGZ1bmN0aW9uIGVtaXRTY29wZVByb2MgKGVudiwgYXJncykge1xyXG4gICAgdmFyIHNjb3BlID0gZW52LnByb2MoJ3Njb3BlJywgMyk7XHJcbiAgICBlbnYuYmF0Y2hJZCA9ICdhMic7XHJcblxyXG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWQ7XHJcbiAgICB2YXIgQ1VSUkVOVF9TVEFURSA9IHNoYXJlZC5jdXJyZW50O1xyXG5cclxuICAgIGVtaXRDb250ZXh0KGVudiwgc2NvcGUsIGFyZ3MuY29udGV4dCk7XHJcblxyXG4gICAgaWYgKGFyZ3MuZnJhbWVidWZmZXIpIHtcclxuICAgICAgYXJncy5mcmFtZWJ1ZmZlci5hcHBlbmQoZW52LCBzY29wZSk7XHJcbiAgICB9XHJcblxyXG4gICAgc29ydFN0YXRlKE9iamVjdC5rZXlzKGFyZ3Muc3RhdGUpKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XHJcbiAgICAgIHZhciBkZWZuID0gYXJncy5zdGF0ZVtuYW1lXTtcclxuICAgICAgdmFyIHZhbHVlID0gZGVmbi5hcHBlbmQoZW52LCBzY29wZSk7XHJcbiAgICAgIGlmIChpc0FycmF5TGlrZSh2YWx1ZSkpIHtcclxuICAgICAgICB2YWx1ZS5mb3JFYWNoKGZ1bmN0aW9uICh2LCBpKSB7XHJcbiAgICAgICAgICBzY29wZS5zZXQoZW52Lm5leHRbbmFtZV0sICdbJyArIGkgKyAnXScsIHYpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHNjb3BlLnNldChzaGFyZWQubmV4dCwgJy4nICsgbmFtZSwgdmFsdWUpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICBlbWl0UHJvZmlsZShlbnYsIHNjb3BlLCBhcmdzLCB0cnVlLCB0cnVlKVxyXG5cclxuICAgIDtbU19FTEVNRU5UUywgU19PRkZTRVQsIFNfQ09VTlQsIFNfSU5TVEFOQ0VTLCBTX1BSSU1JVElWRV0uZm9yRWFjaChcclxuICAgICAgZnVuY3Rpb24gKG9wdCkge1xyXG4gICAgICAgIHZhciB2YXJpYWJsZSA9IGFyZ3MuZHJhd1tvcHRdO1xyXG4gICAgICAgIGlmICghdmFyaWFibGUpIHtcclxuICAgICAgICAgIHJldHVyblxyXG4gICAgICAgIH1cclxuICAgICAgICBzY29wZS5zZXQoc2hhcmVkLmRyYXcsICcuJyArIG9wdCwgJycgKyB2YXJpYWJsZS5hcHBlbmQoZW52LCBzY29wZSkpO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICBPYmplY3Qua2V5cyhhcmdzLnVuaWZvcm1zKS5mb3JFYWNoKGZ1bmN0aW9uIChvcHQpIHtcclxuICAgICAgc2NvcGUuc2V0KFxyXG4gICAgICAgIHNoYXJlZC51bmlmb3JtcyxcclxuICAgICAgICAnWycgKyBzdHJpbmdTdG9yZS5pZChvcHQpICsgJ10nLFxyXG4gICAgICAgIGFyZ3MudW5pZm9ybXNbb3B0XS5hcHBlbmQoZW52LCBzY29wZSkpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgT2JqZWN0LmtleXMoYXJncy5hdHRyaWJ1dGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XHJcbiAgICAgIHZhciByZWNvcmQgPSBhcmdzLmF0dHJpYnV0ZXNbbmFtZV0uYXBwZW5kKGVudiwgc2NvcGUpO1xyXG4gICAgICB2YXIgc2NvcGVBdHRyaWIgPSBlbnYuc2NvcGVBdHRyaWIobmFtZSk7XHJcbiAgICAgIE9iamVjdC5rZXlzKG5ldyBBdHRyaWJ1dGVSZWNvcmQoKSkuZm9yRWFjaChmdW5jdGlvbiAocHJvcCkge1xyXG4gICAgICAgIHNjb3BlLnNldChzY29wZUF0dHJpYiwgJy4nICsgcHJvcCwgcmVjb3JkW3Byb3BdKTtcclxuICAgICAgfSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBmdW5jdGlvbiBzYXZlU2hhZGVyIChuYW1lKSB7XHJcbiAgICAgIHZhciBzaGFkZXIgPSBhcmdzLnNoYWRlcltuYW1lXTtcclxuICAgICAgaWYgKHNoYWRlcikge1xyXG4gICAgICAgIHNjb3BlLnNldChzaGFyZWQuc2hhZGVyLCAnLicgKyBuYW1lLCBzaGFkZXIuYXBwZW5kKGVudiwgc2NvcGUpKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgc2F2ZVNoYWRlcihTX1ZFUlQpO1xyXG4gICAgc2F2ZVNoYWRlcihTX0ZSQUcpO1xyXG5cclxuICAgIGlmIChPYmplY3Qua2V5cyhhcmdzLnN0YXRlKS5sZW5ndGggPiAwKSB7XHJcbiAgICAgIHNjb3BlKENVUlJFTlRfU1RBVEUsICcuZGlydHk9dHJ1ZTsnKTtcclxuICAgICAgc2NvcGUuZXhpdChDVVJSRU5UX1NUQVRFLCAnLmRpcnR5PXRydWU7Jyk7XHJcbiAgICB9XHJcblxyXG4gICAgc2NvcGUoJ2ExKCcsIGVudi5zaGFyZWQuY29udGV4dCwgJyxhMCwnLCBlbnYuYmF0Y2hJZCwgJyk7Jyk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBpc0R5bmFtaWNPYmplY3QgKG9iamVjdCkge1xyXG4gICAgaWYgKHR5cGVvZiBvYmplY3QgIT09ICdvYmplY3QnIHx8IGlzQXJyYXlMaWtlKG9iamVjdCkpIHtcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcbiAgICB2YXIgcHJvcHMgPSBPYmplY3Qua2V5cyhvYmplY3QpO1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwcm9wcy5sZW5ndGg7ICsraSkge1xyXG4gICAgICBpZiAoZHluYW1pYy5pc0R5bmFtaWMob2JqZWN0W3Byb3BzW2ldXSkpIHtcclxuICAgICAgICByZXR1cm4gdHJ1ZVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gZmFsc2VcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHNwbGF0T2JqZWN0IChlbnYsIG9wdGlvbnMsIG5hbWUpIHtcclxuICAgIHZhciBvYmplY3QgPSBvcHRpb25zLnN0YXRpY1tuYW1lXTtcclxuICAgIGlmICghb2JqZWN0IHx8ICFpc0R5bmFtaWNPYmplY3Qob2JqZWN0KSkge1xyXG4gICAgICByZXR1cm5cclxuICAgIH1cclxuXHJcbiAgICB2YXIgZ2xvYmFscyA9IGVudi5nbG9iYWw7XHJcbiAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKG9iamVjdCk7XHJcbiAgICB2YXIgdGhpc0RlcCA9IGZhbHNlO1xyXG4gICAgdmFyIGNvbnRleHREZXAgPSBmYWxzZTtcclxuICAgIHZhciBwcm9wRGVwID0gZmFsc2U7XHJcbiAgICB2YXIgb2JqZWN0UmVmID0gZW52Lmdsb2JhbC5kZWYoJ3t9Jyk7XHJcbiAgICBrZXlzLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xyXG4gICAgICB2YXIgdmFsdWUgPSBvYmplY3Rba2V5XTtcclxuICAgICAgaWYgKGR5bmFtaWMuaXNEeW5hbWljKHZhbHVlKSkge1xyXG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgIHZhbHVlID0gb2JqZWN0W2tleV0gPSBkeW5hbWljLnVuYm94KHZhbHVlKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdmFyIGRlcHMgPSBjcmVhdGVEeW5hbWljRGVjbCh2YWx1ZSwgbnVsbCk7XHJcbiAgICAgICAgdGhpc0RlcCA9IHRoaXNEZXAgfHwgZGVwcy50aGlzRGVwO1xyXG4gICAgICAgIHByb3BEZXAgPSBwcm9wRGVwIHx8IGRlcHMucHJvcERlcDtcclxuICAgICAgICBjb250ZXh0RGVwID0gY29udGV4dERlcCB8fCBkZXBzLmNvbnRleHREZXA7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgZ2xvYmFscyhvYmplY3RSZWYsICcuJywga2V5LCAnPScpO1xyXG4gICAgICAgIHN3aXRjaCAodHlwZW9mIHZhbHVlKSB7XHJcbiAgICAgICAgICBjYXNlICdudW1iZXInOlxyXG4gICAgICAgICAgICBnbG9iYWxzKHZhbHVlKTtcclxuICAgICAgICAgICAgYnJlYWtcclxuICAgICAgICAgIGNhc2UgJ3N0cmluZyc6XHJcbiAgICAgICAgICAgIGdsb2JhbHMoJ1wiJywgdmFsdWUsICdcIicpO1xyXG4gICAgICAgICAgICBicmVha1xyXG4gICAgICAgICAgY2FzZSAnb2JqZWN0JzpcclxuICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XHJcbiAgICAgICAgICAgICAgZ2xvYmFscygnWycsIHZhbHVlLmpvaW4oKSwgJ10nKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBicmVha1xyXG4gICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgZ2xvYmFscyhlbnYubGluayh2YWx1ZSkpO1xyXG4gICAgICAgICAgICBicmVha1xyXG4gICAgICAgIH1cclxuICAgICAgICBnbG9iYWxzKCc7Jyk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIGZ1bmN0aW9uIGFwcGVuZEJsb2NrIChlbnYsIGJsb2NrKSB7XHJcbiAgICAgIGtleXMuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XHJcbiAgICAgICAgdmFyIHZhbHVlID0gb2JqZWN0W2tleV07XHJcbiAgICAgICAgaWYgKCFkeW5hbWljLmlzRHluYW1pYyh2YWx1ZSkpIHtcclxuICAgICAgICAgIHJldHVyblxyXG4gICAgICAgIH1cclxuICAgICAgICB2YXIgcmVmID0gZW52Lmludm9rZShibG9jaywgdmFsdWUpO1xyXG4gICAgICAgIGJsb2NrKG9iamVjdFJlZiwgJy4nLCBrZXksICc9JywgcmVmLCAnOycpO1xyXG4gICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBvcHRpb25zLmR5bmFtaWNbbmFtZV0gPSBuZXcgZHluYW1pYy5EeW5hbWljVmFyaWFibGUoRFlOX1RIVU5LLCB7XHJcbiAgICAgIHRoaXNEZXA6IHRoaXNEZXAsXHJcbiAgICAgIGNvbnRleHREZXA6IGNvbnRleHREZXAsXHJcbiAgICAgIHByb3BEZXA6IHByb3BEZXAsXHJcbiAgICAgIHJlZjogb2JqZWN0UmVmLFxyXG4gICAgICBhcHBlbmQ6IGFwcGVuZEJsb2NrXHJcbiAgICB9KTtcclxuICAgIGRlbGV0ZSBvcHRpb25zLnN0YXRpY1tuYW1lXTtcclxuICB9XHJcblxyXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gIC8vIE1BSU4gRFJBVyBDT01NQU5EXHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgZnVuY3Rpb24gY29tcGlsZUNvbW1hbmQgKG9wdGlvbnMsIGF0dHJpYnV0ZXMsIHVuaWZvcm1zLCBjb250ZXh0LCBzdGF0cykge1xyXG4gICAgdmFyIGVudiA9IGNyZWF0ZVJFR0xFbnZpcm9ubWVudCgpO1xyXG5cclxuICAgIC8vIGxpbmsgc3RhdHMsIHNvIHRoYXQgd2UgY2FuIGVhc2lseSBhY2Nlc3MgaXQgaW4gdGhlIHByb2dyYW0uXHJcbiAgICBlbnYuc3RhdHMgPSBlbnYubGluayhzdGF0cyk7XHJcblxyXG4gICAgLy8gc3BsYXQgb3B0aW9ucyBhbmQgYXR0cmlidXRlcyB0byBhbGxvdyBmb3IgZHluYW1pYyBuZXN0ZWQgcHJvcGVydGllc1xyXG4gICAgT2JqZWN0LmtleXMoYXR0cmlidXRlcy5zdGF0aWMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xyXG4gICAgICBzcGxhdE9iamVjdChlbnYsIGF0dHJpYnV0ZXMsIGtleSk7XHJcbiAgICB9KTtcclxuICAgIE5FU1RFRF9PUFRJT05TLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcclxuICAgICAgc3BsYXRPYmplY3QoZW52LCBvcHRpb25zLCBuYW1lKTtcclxuICAgIH0pO1xyXG5cclxuICAgIHZhciBhcmdzID0gcGFyc2VBcmd1bWVudHMob3B0aW9ucywgYXR0cmlidXRlcywgdW5pZm9ybXMsIGNvbnRleHQsIGVudik7XHJcblxyXG4gICAgZW1pdERyYXdQcm9jKGVudiwgYXJncyk7XHJcbiAgICBlbWl0U2NvcGVQcm9jKGVudiwgYXJncyk7XHJcbiAgICBlbWl0QmF0Y2hQcm9jKGVudiwgYXJncyk7XHJcblxyXG4gICAgcmV0dXJuIGVudi5jb21waWxlKClcclxuICB9XHJcblxyXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gIC8vIFBPTEwgLyBSRUZSRVNIXHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgcmV0dXJuIHtcclxuICAgIG5leHQ6IG5leHRTdGF0ZSxcclxuICAgIGN1cnJlbnQ6IGN1cnJlbnRTdGF0ZSxcclxuICAgIHByb2NzOiAoZnVuY3Rpb24gKCkge1xyXG4gICAgICB2YXIgZW52ID0gY3JlYXRlUkVHTEVudmlyb25tZW50KCk7XHJcbiAgICAgIHZhciBwb2xsID0gZW52LnByb2MoJ3BvbGwnKTtcclxuICAgICAgdmFyIHJlZnJlc2ggPSBlbnYucHJvYygncmVmcmVzaCcpO1xyXG4gICAgICB2YXIgY29tbW9uID0gZW52LmJsb2NrKCk7XHJcbiAgICAgIHBvbGwoY29tbW9uKTtcclxuICAgICAgcmVmcmVzaChjb21tb24pO1xyXG5cclxuICAgICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWQ7XHJcbiAgICAgIHZhciBHTCA9IHNoYXJlZC5nbDtcclxuICAgICAgdmFyIE5FWFRfU1RBVEUgPSBzaGFyZWQubmV4dDtcclxuICAgICAgdmFyIENVUlJFTlRfU1RBVEUgPSBzaGFyZWQuY3VycmVudDtcclxuXHJcbiAgICAgIGNvbW1vbihDVVJSRU5UX1NUQVRFLCAnLmRpcnR5PWZhbHNlOycpO1xyXG5cclxuICAgICAgZW1pdFBvbGxGcmFtZWJ1ZmZlcihlbnYsIHBvbGwpO1xyXG4gICAgICBlbWl0UG9sbEZyYW1lYnVmZmVyKGVudiwgcmVmcmVzaCwgbnVsbCwgdHJ1ZSk7XHJcblxyXG4gICAgICAvLyBSZWZyZXNoIHVwZGF0ZXMgYWxsIGF0dHJpYnV0ZSBzdGF0ZSBjaGFuZ2VzXHJcbiAgICAgIHZhciBJTlNUQU5DSU5HO1xyXG4gICAgICBpZiAoZXh0SW5zdGFuY2luZykge1xyXG4gICAgICAgIElOU1RBTkNJTkcgPSBlbnYubGluayhleHRJbnN0YW5jaW5nKTtcclxuICAgICAgfVxyXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxpbWl0cy5tYXhBdHRyaWJ1dGVzOyArK2kpIHtcclxuICAgICAgICB2YXIgQklORElORyA9IHJlZnJlc2guZGVmKHNoYXJlZC5hdHRyaWJ1dGVzLCAnWycsIGksICddJyk7XHJcbiAgICAgICAgdmFyIGlmdGUgPSBlbnYuY29uZChCSU5ESU5HLCAnLmJ1ZmZlcicpO1xyXG4gICAgICAgIGlmdGUudGhlbihcclxuICAgICAgICAgIEdMLCAnLmVuYWJsZVZlcnRleEF0dHJpYkFycmF5KCcsIGksICcpOycsXHJcbiAgICAgICAgICBHTCwgJy5iaW5kQnVmZmVyKCcsXHJcbiAgICAgICAgICAgIEdMX0FSUkFZX0JVRkZFUiQxLCAnLCcsXHJcbiAgICAgICAgICAgIEJJTkRJTkcsICcuYnVmZmVyLmJ1ZmZlcik7JyxcclxuICAgICAgICAgIEdMLCAnLnZlcnRleEF0dHJpYlBvaW50ZXIoJyxcclxuICAgICAgICAgICAgaSwgJywnLFxyXG4gICAgICAgICAgICBCSU5ESU5HLCAnLnNpemUsJyxcclxuICAgICAgICAgICAgQklORElORywgJy50eXBlLCcsXHJcbiAgICAgICAgICAgIEJJTkRJTkcsICcubm9ybWFsaXplZCwnLFxyXG4gICAgICAgICAgICBCSU5ESU5HLCAnLnN0cmlkZSwnLFxyXG4gICAgICAgICAgICBCSU5ESU5HLCAnLm9mZnNldCk7J1xyXG4gICAgICAgICkuZWxzZShcclxuICAgICAgICAgIEdMLCAnLmRpc2FibGVWZXJ0ZXhBdHRyaWJBcnJheSgnLCBpLCAnKTsnLFxyXG4gICAgICAgICAgR0wsICcudmVydGV4QXR0cmliNGYoJyxcclxuICAgICAgICAgICAgaSwgJywnLFxyXG4gICAgICAgICAgICBCSU5ESU5HLCAnLngsJyxcclxuICAgICAgICAgICAgQklORElORywgJy55LCcsXHJcbiAgICAgICAgICAgIEJJTkRJTkcsICcueiwnLFxyXG4gICAgICAgICAgICBCSU5ESU5HLCAnLncpOycsXHJcbiAgICAgICAgICBCSU5ESU5HLCAnLmJ1ZmZlcj1udWxsOycpO1xyXG4gICAgICAgIHJlZnJlc2goaWZ0ZSk7XHJcbiAgICAgICAgaWYgKGV4dEluc3RhbmNpbmcpIHtcclxuICAgICAgICAgIHJlZnJlc2goXHJcbiAgICAgICAgICAgIElOU1RBTkNJTkcsICcudmVydGV4QXR0cmliRGl2aXNvckFOR0xFKCcsXHJcbiAgICAgICAgICAgIGksICcsJyxcclxuICAgICAgICAgICAgQklORElORywgJy5kaXZpc29yKTsnKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIE9iamVjdC5rZXlzKEdMX0ZMQUdTKS5mb3JFYWNoKGZ1bmN0aW9uIChmbGFnKSB7XHJcbiAgICAgICAgdmFyIGNhcCA9IEdMX0ZMQUdTW2ZsYWddO1xyXG4gICAgICAgIHZhciBORVhUID0gY29tbW9uLmRlZihORVhUX1NUQVRFLCAnLicsIGZsYWcpO1xyXG4gICAgICAgIHZhciBibG9jayA9IGVudi5ibG9jaygpO1xyXG4gICAgICAgIGJsb2NrKCdpZignLCBORVhULCAnKXsnLFxyXG4gICAgICAgICAgR0wsICcuZW5hYmxlKCcsIGNhcCwgJyl9ZWxzZXsnLFxyXG4gICAgICAgICAgR0wsICcuZGlzYWJsZSgnLCBjYXAsICcpfScsXHJcbiAgICAgICAgICBDVVJSRU5UX1NUQVRFLCAnLicsIGZsYWcsICc9JywgTkVYVCwgJzsnKTtcclxuICAgICAgICByZWZyZXNoKGJsb2NrKTtcclxuICAgICAgICBwb2xsKFxyXG4gICAgICAgICAgJ2lmKCcsIE5FWFQsICchPT0nLCBDVVJSRU5UX1NUQVRFLCAnLicsIGZsYWcsICcpeycsXHJcbiAgICAgICAgICBibG9jayxcclxuICAgICAgICAgICd9Jyk7XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgT2JqZWN0LmtleXMoR0xfVkFSSUFCTEVTKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XHJcbiAgICAgICAgdmFyIGZ1bmMgPSBHTF9WQVJJQUJMRVNbbmFtZV07XHJcbiAgICAgICAgdmFyIGluaXQgPSBjdXJyZW50U3RhdGVbbmFtZV07XHJcbiAgICAgICAgdmFyIE5FWFQsIENVUlJFTlQ7XHJcbiAgICAgICAgdmFyIGJsb2NrID0gZW52LmJsb2NrKCk7XHJcbiAgICAgICAgYmxvY2soR0wsICcuJywgZnVuYywgJygnKTtcclxuICAgICAgICBpZiAoaXNBcnJheUxpa2UoaW5pdCkpIHtcclxuICAgICAgICAgIHZhciBuID0gaW5pdC5sZW5ndGg7XHJcbiAgICAgICAgICBORVhUID0gZW52Lmdsb2JhbC5kZWYoTkVYVF9TVEFURSwgJy4nLCBuYW1lKTtcclxuICAgICAgICAgIENVUlJFTlQgPSBlbnYuZ2xvYmFsLmRlZihDVVJSRU5UX1NUQVRFLCAnLicsIG5hbWUpO1xyXG4gICAgICAgICAgYmxvY2soXHJcbiAgICAgICAgICAgIGxvb3AobiwgZnVuY3Rpb24gKGkpIHtcclxuICAgICAgICAgICAgICByZXR1cm4gTkVYVCArICdbJyArIGkgKyAnXSdcclxuICAgICAgICAgICAgfSksICcpOycsXHJcbiAgICAgICAgICAgIGxvb3AobiwgZnVuY3Rpb24gKGkpIHtcclxuICAgICAgICAgICAgICByZXR1cm4gQ1VSUkVOVCArICdbJyArIGkgKyAnXT0nICsgTkVYVCArICdbJyArIGkgKyAnXTsnXHJcbiAgICAgICAgICAgIH0pLmpvaW4oJycpKTtcclxuICAgICAgICAgIHBvbGwoXHJcbiAgICAgICAgICAgICdpZignLCBsb29wKG4sIGZ1bmN0aW9uIChpKSB7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIE5FWFQgKyAnWycgKyBpICsgJ10hPT0nICsgQ1VSUkVOVCArICdbJyArIGkgKyAnXSdcclxuICAgICAgICAgICAgfSkuam9pbignfHwnKSwgJyl7JyxcclxuICAgICAgICAgICAgYmxvY2ssXHJcbiAgICAgICAgICAgICd9Jyk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIE5FWFQgPSBjb21tb24uZGVmKE5FWFRfU1RBVEUsICcuJywgbmFtZSk7XHJcbiAgICAgICAgICBDVVJSRU5UID0gY29tbW9uLmRlZihDVVJSRU5UX1NUQVRFLCAnLicsIG5hbWUpO1xyXG4gICAgICAgICAgYmxvY2soXHJcbiAgICAgICAgICAgIE5FWFQsICcpOycsXHJcbiAgICAgICAgICAgIENVUlJFTlRfU1RBVEUsICcuJywgbmFtZSwgJz0nLCBORVhULCAnOycpO1xyXG4gICAgICAgICAgcG9sbChcclxuICAgICAgICAgICAgJ2lmKCcsIE5FWFQsICchPT0nLCBDVVJSRU5ULCAnKXsnLFxyXG4gICAgICAgICAgICBibG9jayxcclxuICAgICAgICAgICAgJ30nKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmVmcmVzaChibG9jayk7XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgcmV0dXJuIGVudi5jb21waWxlKClcclxuICAgIH0pKCksXHJcbiAgICBjb21waWxlOiBjb21waWxlQ29tbWFuZFxyXG4gIH1cclxufVxuXG5mdW5jdGlvbiBzdGF0cyAoKSB7XHJcbiAgcmV0dXJuIHtcclxuICAgIGJ1ZmZlckNvdW50OiAwLFxyXG4gICAgZWxlbWVudHNDb3VudDogMCxcclxuICAgIGZyYW1lYnVmZmVyQ291bnQ6IDAsXHJcbiAgICBzaGFkZXJDb3VudDogMCxcclxuICAgIHRleHR1cmVDb3VudDogMCxcclxuICAgIGN1YmVDb3VudDogMCxcclxuICAgIHJlbmRlcmJ1ZmZlckNvdW50OiAwLFxyXG4gICAgbWF4VGV4dHVyZVVuaXRzOiAwXHJcbiAgfVxyXG59XG5cbnZhciBHTF9RVUVSWV9SRVNVTFRfRVhUID0gMHg4ODY2O1xyXG52YXIgR0xfUVVFUllfUkVTVUxUX0FWQUlMQUJMRV9FWFQgPSAweDg4Njc7XHJcbnZhciBHTF9USU1FX0VMQVBTRURfRVhUID0gMHg4OEJGO1xyXG5cclxudmFyIGNyZWF0ZVRpbWVyID0gZnVuY3Rpb24gKGdsLCBleHRlbnNpb25zKSB7XHJcbiAgaWYgKCFleHRlbnNpb25zLmV4dF9kaXNqb2ludF90aW1lcl9xdWVyeSkge1xyXG4gICAgcmV0dXJuIG51bGxcclxuICB9XHJcblxyXG4gIC8vIFFVRVJZIFBPT0wgQkVHSU5cclxuICB2YXIgcXVlcnlQb29sID0gW107XHJcbiAgZnVuY3Rpb24gYWxsb2NRdWVyeSAoKSB7XHJcbiAgICByZXR1cm4gcXVlcnlQb29sLnBvcCgpIHx8IGV4dGVuc2lvbnMuZXh0X2Rpc2pvaW50X3RpbWVyX3F1ZXJ5LmNyZWF0ZVF1ZXJ5RVhUKClcclxuICB9XHJcbiAgZnVuY3Rpb24gZnJlZVF1ZXJ5IChxdWVyeSkge1xyXG4gICAgcXVlcnlQb29sLnB1c2gocXVlcnkpO1xyXG4gIH1cclxuICAvLyBRVUVSWSBQT09MIEVORFxyXG5cclxuICB2YXIgcGVuZGluZ1F1ZXJpZXMgPSBbXTtcclxuICBmdW5jdGlvbiBiZWdpblF1ZXJ5IChzdGF0cykge1xyXG4gICAgdmFyIHF1ZXJ5ID0gYWxsb2NRdWVyeSgpO1xyXG4gICAgZXh0ZW5zaW9ucy5leHRfZGlzam9pbnRfdGltZXJfcXVlcnkuYmVnaW5RdWVyeUVYVChHTF9USU1FX0VMQVBTRURfRVhULCBxdWVyeSk7XHJcbiAgICBwZW5kaW5nUXVlcmllcy5wdXNoKHF1ZXJ5KTtcclxuICAgIHB1c2hTY29wZVN0YXRzKHBlbmRpbmdRdWVyaWVzLmxlbmd0aCAtIDEsIHBlbmRpbmdRdWVyaWVzLmxlbmd0aCwgc3RhdHMpO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZW5kUXVlcnkgKCkge1xyXG4gICAgZXh0ZW5zaW9ucy5leHRfZGlzam9pbnRfdGltZXJfcXVlcnkuZW5kUXVlcnlFWFQoR0xfVElNRV9FTEFQU0VEX0VYVCk7XHJcbiAgfVxyXG5cclxuICAvL1xyXG4gIC8vIFBlbmRpbmcgc3RhdHMgcG9vbC5cclxuICAvL1xyXG4gIGZ1bmN0aW9uIFBlbmRpbmdTdGF0cyAoKSB7XHJcbiAgICB0aGlzLnN0YXJ0UXVlcnlJbmRleCA9IC0xO1xyXG4gICAgdGhpcy5lbmRRdWVyeUluZGV4ID0gLTE7XHJcbiAgICB0aGlzLnN1bSA9IDA7XHJcbiAgICB0aGlzLnN0YXRzID0gbnVsbDtcclxuICB9XHJcbiAgdmFyIHBlbmRpbmdTdGF0c1Bvb2wgPSBbXTtcclxuICBmdW5jdGlvbiBhbGxvY1BlbmRpbmdTdGF0cyAoKSB7XHJcbiAgICByZXR1cm4gcGVuZGluZ1N0YXRzUG9vbC5wb3AoKSB8fCBuZXcgUGVuZGluZ1N0YXRzKClcclxuICB9XHJcbiAgZnVuY3Rpb24gZnJlZVBlbmRpbmdTdGF0cyAocGVuZGluZ1N0YXRzKSB7XHJcbiAgICBwZW5kaW5nU3RhdHNQb29sLnB1c2gocGVuZGluZ1N0YXRzKTtcclxuICB9XHJcbiAgLy8gUGVuZGluZyBzdGF0cyBwb29sIGVuZFxyXG5cclxuICB2YXIgcGVuZGluZ1N0YXRzID0gW107XHJcbiAgZnVuY3Rpb24gcHVzaFNjb3BlU3RhdHMgKHN0YXJ0LCBlbmQsIHN0YXRzKSB7XHJcbiAgICB2YXIgcHMgPSBhbGxvY1BlbmRpbmdTdGF0cygpO1xyXG4gICAgcHMuc3RhcnRRdWVyeUluZGV4ID0gc3RhcnQ7XHJcbiAgICBwcy5lbmRRdWVyeUluZGV4ID0gZW5kO1xyXG4gICAgcHMuc3VtID0gMDtcclxuICAgIHBzLnN0YXRzID0gc3RhdHM7XHJcbiAgICBwZW5kaW5nU3RhdHMucHVzaChwcyk7XHJcbiAgfVxyXG5cclxuICAvLyB3ZSBzaG91bGQgY2FsbCB0aGlzIGF0IHRoZSBiZWdpbm5pbmcgb2YgdGhlIGZyYW1lLFxyXG4gIC8vIGluIG9yZGVyIHRvIHVwZGF0ZSBncHVUaW1lXHJcbiAgdmFyIHRpbWVTdW0gPSBbXTtcclxuICB2YXIgcXVlcnlQdHIgPSBbXTtcclxuICBmdW5jdGlvbiB1cGRhdGUgKCkge1xyXG4gICAgdmFyIHB0ciwgaTtcclxuXHJcbiAgICB2YXIgbiA9IHBlbmRpbmdRdWVyaWVzLmxlbmd0aDtcclxuICAgIGlmIChuID09PSAwKSB7XHJcbiAgICAgIHJldHVyblxyXG4gICAgfVxyXG5cclxuICAgIC8vIFJlc2VydmUgc3BhY2VcclxuICAgIHF1ZXJ5UHRyLmxlbmd0aCA9IE1hdGgubWF4KHF1ZXJ5UHRyLmxlbmd0aCwgbiArIDEpO1xyXG4gICAgdGltZVN1bS5sZW5ndGggPSBNYXRoLm1heCh0aW1lU3VtLmxlbmd0aCwgbiArIDEpO1xyXG4gICAgdGltZVN1bVswXSA9IDA7XHJcbiAgICBxdWVyeVB0clswXSA9IDA7XHJcblxyXG4gICAgLy8gVXBkYXRlIGFsbCBwZW5kaW5nIHRpbWVyIHF1ZXJpZXNcclxuICAgIHZhciBxdWVyeVRpbWUgPSAwO1xyXG4gICAgcHRyID0gMDtcclxuICAgIGZvciAoaSA9IDA7IGkgPCBwZW5kaW5nUXVlcmllcy5sZW5ndGg7ICsraSkge1xyXG4gICAgICB2YXIgcXVlcnkgPSBwZW5kaW5nUXVlcmllc1tpXTtcclxuICAgICAgaWYgKGV4dGVuc2lvbnMuZXh0X2Rpc2pvaW50X3RpbWVyX3F1ZXJ5LmdldFF1ZXJ5T2JqZWN0RVhUKHF1ZXJ5LCBHTF9RVUVSWV9SRVNVTFRfQVZBSUxBQkxFX0VYVCkpIHtcclxuICAgICAgICBxdWVyeVRpbWUgKz0gZXh0ZW5zaW9ucy5leHRfZGlzam9pbnRfdGltZXJfcXVlcnkuZ2V0UXVlcnlPYmplY3RFWFQocXVlcnksIEdMX1FVRVJZX1JFU1VMVF9FWFQpO1xyXG4gICAgICAgIGZyZWVRdWVyeShxdWVyeSk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcGVuZGluZ1F1ZXJpZXNbcHRyKytdID0gcXVlcnk7XHJcbiAgICAgIH1cclxuICAgICAgdGltZVN1bVtpICsgMV0gPSBxdWVyeVRpbWU7XHJcbiAgICAgIHF1ZXJ5UHRyW2kgKyAxXSA9IHB0cjtcclxuICAgIH1cclxuICAgIHBlbmRpbmdRdWVyaWVzLmxlbmd0aCA9IHB0cjtcclxuXHJcbiAgICAvLyBVcGRhdGUgYWxsIHBlbmRpbmcgc3RhdCBxdWVyaWVzXHJcbiAgICBwdHIgPSAwO1xyXG4gICAgZm9yIChpID0gMDsgaSA8IHBlbmRpbmdTdGF0cy5sZW5ndGg7ICsraSkge1xyXG4gICAgICB2YXIgc3RhdHMgPSBwZW5kaW5nU3RhdHNbaV07XHJcbiAgICAgIHZhciBzdGFydCA9IHN0YXRzLnN0YXJ0UXVlcnlJbmRleDtcclxuICAgICAgdmFyIGVuZCA9IHN0YXRzLmVuZFF1ZXJ5SW5kZXg7XHJcbiAgICAgIHN0YXRzLnN1bSArPSB0aW1lU3VtW2VuZF0gLSB0aW1lU3VtW3N0YXJ0XTtcclxuICAgICAgdmFyIHN0YXJ0UHRyID0gcXVlcnlQdHJbc3RhcnRdO1xyXG4gICAgICB2YXIgZW5kUHRyID0gcXVlcnlQdHJbZW5kXTtcclxuICAgICAgaWYgKGVuZFB0ciA9PT0gc3RhcnRQdHIpIHtcclxuICAgICAgICBzdGF0cy5zdGF0cy5ncHVUaW1lICs9IHN0YXRzLnN1bSAvIDFlNjtcclxuICAgICAgICBmcmVlUGVuZGluZ1N0YXRzKHN0YXRzKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBzdGF0cy5zdGFydFF1ZXJ5SW5kZXggPSBzdGFydFB0cjtcclxuICAgICAgICBzdGF0cy5lbmRRdWVyeUluZGV4ID0gZW5kUHRyO1xyXG4gICAgICAgIHBlbmRpbmdTdGF0c1twdHIrK10gPSBzdGF0cztcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgcGVuZGluZ1N0YXRzLmxlbmd0aCA9IHB0cjtcclxuICB9XHJcblxyXG4gIHJldHVybiB7XHJcbiAgICBiZWdpblF1ZXJ5OiBiZWdpblF1ZXJ5LFxyXG4gICAgZW5kUXVlcnk6IGVuZFF1ZXJ5LFxyXG4gICAgcHVzaFNjb3BlU3RhdHM6IHB1c2hTY29wZVN0YXRzLFxyXG4gICAgdXBkYXRlOiB1cGRhdGUsXHJcbiAgICBnZXROdW1QZW5kaW5nUXVlcmllczogZnVuY3Rpb24gKCkge1xyXG4gICAgICByZXR1cm4gcGVuZGluZ1F1ZXJpZXMubGVuZ3RoXHJcbiAgICB9LFxyXG4gICAgY2xlYXI6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgcXVlcnlQb29sLnB1c2guYXBwbHkocXVlcnlQb29sLCBwZW5kaW5nUXVlcmllcyk7XHJcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcXVlcnlQb29sLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgZXh0ZW5zaW9ucy5leHRfZGlzam9pbnRfdGltZXJfcXVlcnkuZGVsZXRlUXVlcnlFWFQocXVlcnlQb29sW2ldKTtcclxuICAgICAgfVxyXG4gICAgICBwZW5kaW5nUXVlcmllcy5sZW5ndGggPSAwO1xyXG4gICAgICBxdWVyeVBvb2wubGVuZ3RoID0gMDtcclxuICAgIH0sXHJcbiAgICByZXN0b3JlOiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgIHBlbmRpbmdRdWVyaWVzLmxlbmd0aCA9IDA7XHJcbiAgICAgIHF1ZXJ5UG9vbC5sZW5ndGggPSAwO1xyXG4gICAgfVxyXG4gIH1cclxufTtcblxudmFyIEdMX0NPTE9SX0JVRkZFUl9CSVQgPSAxNjM4NDtcclxudmFyIEdMX0RFUFRIX0JVRkZFUl9CSVQgPSAyNTY7XHJcbnZhciBHTF9TVEVOQ0lMX0JVRkZFUl9CSVQgPSAxMDI0O1xyXG5cclxudmFyIEdMX0FSUkFZX0JVRkZFUiA9IDM0OTYyO1xyXG5cclxudmFyIENPTlRFWFRfTE9TVF9FVkVOVCA9ICd3ZWJnbGNvbnRleHRsb3N0JztcclxudmFyIENPTlRFWFRfUkVTVE9SRURfRVZFTlQgPSAnd2ViZ2xjb250ZXh0cmVzdG9yZWQnO1xyXG5cclxudmFyIERZTl9QUk9QID0gMTtcclxudmFyIERZTl9DT05URVhUID0gMjtcclxudmFyIERZTl9TVEFURSA9IDM7XHJcblxyXG5mdW5jdGlvbiBmaW5kIChoYXlzdGFjaywgbmVlZGxlKSB7XHJcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBoYXlzdGFjay5sZW5ndGg7ICsraSkge1xyXG4gICAgaWYgKGhheXN0YWNrW2ldID09PSBuZWVkbGUpIHtcclxuICAgICAgcmV0dXJuIGlcclxuICAgIH1cclxuICB9XHJcbiAgcmV0dXJuIC0xXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHdyYXBSRUdMIChhcmdzKSB7XHJcbiAgdmFyIGNvbmZpZyA9IHBhcnNlQXJncyhhcmdzKTtcclxuICBpZiAoIWNvbmZpZykge1xyXG4gICAgcmV0dXJuIG51bGxcclxuICB9XHJcblxyXG4gIHZhciBnbCA9IGNvbmZpZy5nbDtcclxuICB2YXIgZ2xBdHRyaWJ1dGVzID0gZ2wuZ2V0Q29udGV4dEF0dHJpYnV0ZXMoKTtcclxuICB2YXIgY29udGV4dExvc3QgPSBnbC5pc0NvbnRleHRMb3N0KCk7XHJcblxyXG4gIHZhciBleHRlbnNpb25TdGF0ZSA9IGNyZWF0ZUV4dGVuc2lvbkNhY2hlKGdsLCBjb25maWcpO1xyXG4gIGlmICghZXh0ZW5zaW9uU3RhdGUpIHtcclxuICAgIHJldHVybiBudWxsXHJcbiAgfVxyXG5cclxuICB2YXIgc3RyaW5nU3RvcmUgPSBjcmVhdGVTdHJpbmdTdG9yZSgpO1xyXG4gIHZhciBzdGF0cyQkMSA9IHN0YXRzKCk7XHJcbiAgdmFyIGV4dGVuc2lvbnMgPSBleHRlbnNpb25TdGF0ZS5leHRlbnNpb25zO1xyXG4gIHZhciB0aW1lciA9IGNyZWF0ZVRpbWVyKGdsLCBleHRlbnNpb25zKTtcclxuXHJcbiAgdmFyIFNUQVJUX1RJTUUgPSBjbG9jaygpO1xyXG4gIHZhciBXSURUSCA9IGdsLmRyYXdpbmdCdWZmZXJXaWR0aDtcclxuICB2YXIgSEVJR0hUID0gZ2wuZHJhd2luZ0J1ZmZlckhlaWdodDtcclxuXHJcbiAgdmFyIGNvbnRleHRTdGF0ZSA9IHtcclxuICAgIHRpY2s6IDAsXHJcbiAgICB0aW1lOiAwLFxyXG4gICAgdmlld3BvcnRXaWR0aDogV0lEVEgsXHJcbiAgICB2aWV3cG9ydEhlaWdodDogSEVJR0hULFxyXG4gICAgZnJhbWVidWZmZXJXaWR0aDogV0lEVEgsXHJcbiAgICBmcmFtZWJ1ZmZlckhlaWdodDogSEVJR0hULFxyXG4gICAgZHJhd2luZ0J1ZmZlcldpZHRoOiBXSURUSCxcclxuICAgIGRyYXdpbmdCdWZmZXJIZWlnaHQ6IEhFSUdIVCxcclxuICAgIHBpeGVsUmF0aW86IGNvbmZpZy5waXhlbFJhdGlvXHJcbiAgfTtcclxuICB2YXIgdW5pZm9ybVN0YXRlID0ge307XHJcbiAgdmFyIGRyYXdTdGF0ZSA9IHtcclxuICAgIGVsZW1lbnRzOiBudWxsLFxyXG4gICAgcHJpbWl0aXZlOiA0LCAvLyBHTF9UUklBTkdMRVNcclxuICAgIGNvdW50OiAtMSxcclxuICAgIG9mZnNldDogMCxcclxuICAgIGluc3RhbmNlczogLTFcclxuICB9O1xyXG5cclxuICB2YXIgbGltaXRzID0gd3JhcExpbWl0cyhnbCwgZXh0ZW5zaW9ucyk7XHJcbiAgdmFyIGF0dHJpYnV0ZVN0YXRlID0gd3JhcEF0dHJpYnV0ZVN0YXRlKFxyXG4gICAgZ2wsXHJcbiAgICBleHRlbnNpb25zLFxyXG4gICAgbGltaXRzLFxyXG4gICAgc3RyaW5nU3RvcmUpO1xyXG4gIHZhciBidWZmZXJTdGF0ZSA9IHdyYXBCdWZmZXJTdGF0ZShcclxuICAgIGdsLFxyXG4gICAgc3RhdHMkJDEsXHJcbiAgICBjb25maWcsXHJcbiAgICBhdHRyaWJ1dGVTdGF0ZSk7XHJcbiAgdmFyIGVsZW1lbnRTdGF0ZSA9IHdyYXBFbGVtZW50c1N0YXRlKGdsLCBleHRlbnNpb25zLCBidWZmZXJTdGF0ZSwgc3RhdHMkJDEpO1xyXG4gIHZhciBzaGFkZXJTdGF0ZSA9IHdyYXBTaGFkZXJTdGF0ZShnbCwgc3RyaW5nU3RvcmUsIHN0YXRzJCQxLCBjb25maWcpO1xyXG4gIHZhciB0ZXh0dXJlU3RhdGUgPSBjcmVhdGVUZXh0dXJlU2V0KFxyXG4gICAgZ2wsXHJcbiAgICBleHRlbnNpb25zLFxyXG4gICAgbGltaXRzLFxyXG4gICAgZnVuY3Rpb24gKCkgeyBjb3JlLnByb2NzLnBvbGwoKTsgfSxcclxuICAgIGNvbnRleHRTdGF0ZSxcclxuICAgIHN0YXRzJCQxLFxyXG4gICAgY29uZmlnKTtcclxuICB2YXIgcmVuZGVyYnVmZmVyU3RhdGUgPSB3cmFwUmVuZGVyYnVmZmVycyhnbCwgZXh0ZW5zaW9ucywgbGltaXRzLCBzdGF0cyQkMSwgY29uZmlnKTtcclxuICB2YXIgZnJhbWVidWZmZXJTdGF0ZSA9IHdyYXBGQk9TdGF0ZShcclxuICAgIGdsLFxyXG4gICAgZXh0ZW5zaW9ucyxcclxuICAgIGxpbWl0cyxcclxuICAgIHRleHR1cmVTdGF0ZSxcclxuICAgIHJlbmRlcmJ1ZmZlclN0YXRlLFxyXG4gICAgc3RhdHMkJDEpO1xyXG4gIHZhciBjb3JlID0gcmVnbENvcmUoXHJcbiAgICBnbCxcclxuICAgIHN0cmluZ1N0b3JlLFxyXG4gICAgZXh0ZW5zaW9ucyxcclxuICAgIGxpbWl0cyxcclxuICAgIGJ1ZmZlclN0YXRlLFxyXG4gICAgZWxlbWVudFN0YXRlLFxyXG4gICAgdGV4dHVyZVN0YXRlLFxyXG4gICAgZnJhbWVidWZmZXJTdGF0ZSxcclxuICAgIHVuaWZvcm1TdGF0ZSxcclxuICAgIGF0dHJpYnV0ZVN0YXRlLFxyXG4gICAgc2hhZGVyU3RhdGUsXHJcbiAgICBkcmF3U3RhdGUsXHJcbiAgICBjb250ZXh0U3RhdGUsXHJcbiAgICB0aW1lcixcclxuICAgIGNvbmZpZyk7XHJcbiAgdmFyIHJlYWRQaXhlbHMgPSB3cmFwUmVhZFBpeGVscyhcclxuICAgIGdsLFxyXG4gICAgZnJhbWVidWZmZXJTdGF0ZSxcclxuICAgIGNvcmUucHJvY3MucG9sbCxcclxuICAgIGNvbnRleHRTdGF0ZSxcclxuICAgIGdsQXR0cmlidXRlcywgZXh0ZW5zaW9ucywgbGltaXRzKTtcclxuXHJcbiAgdmFyIG5leHRTdGF0ZSA9IGNvcmUubmV4dDtcclxuICB2YXIgY2FudmFzID0gZ2wuY2FudmFzO1xyXG5cclxuICB2YXIgcmFmQ2FsbGJhY2tzID0gW107XHJcbiAgdmFyIGxvc3NDYWxsYmFja3MgPSBbXTtcclxuICB2YXIgcmVzdG9yZUNhbGxiYWNrcyA9IFtdO1xyXG4gIHZhciBkZXN0cm95Q2FsbGJhY2tzID0gW2NvbmZpZy5vbkRlc3Ryb3ldO1xyXG5cclxuICB2YXIgYWN0aXZlUkFGID0gbnVsbDtcclxuICBmdW5jdGlvbiBoYW5kbGVSQUYgKCkge1xyXG4gICAgaWYgKHJhZkNhbGxiYWNrcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgaWYgKHRpbWVyKSB7XHJcbiAgICAgICAgdGltZXIudXBkYXRlKCk7XHJcbiAgICAgIH1cclxuICAgICAgYWN0aXZlUkFGID0gbnVsbDtcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcblxyXG4gICAgLy8gc2NoZWR1bGUgbmV4dCBhbmltYXRpb24gZnJhbWVcclxuICAgIGFjdGl2ZVJBRiA9IHJhZi5uZXh0KGhhbmRsZVJBRik7XHJcblxyXG4gICAgLy8gcG9sbCBmb3IgY2hhbmdlc1xyXG4gICAgcG9sbCgpO1xyXG5cclxuICAgIC8vIGZpcmUgYSBjYWxsYmFjayBmb3IgYWxsIHBlbmRpbmcgcmFmc1xyXG4gICAgZm9yICh2YXIgaSA9IHJhZkNhbGxiYWNrcy5sZW5ndGggLSAxOyBpID49IDA7IC0taSkge1xyXG4gICAgICB2YXIgY2IgPSByYWZDYWxsYmFja3NbaV07XHJcbiAgICAgIGlmIChjYikge1xyXG4gICAgICAgIGNiKGNvbnRleHRTdGF0ZSwgbnVsbCwgMCk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBmbHVzaCBhbGwgcGVuZGluZyB3ZWJnbCBjYWxsc1xyXG4gICAgZ2wuZmx1c2goKTtcclxuXHJcbiAgICAvLyBwb2xsIEdQVSB0aW1lcnMgKmFmdGVyKiBnbC5mbHVzaCBzbyB3ZSBkb24ndCBkZWxheSBjb21tYW5kIGRpc3BhdGNoXHJcbiAgICBpZiAodGltZXIpIHtcclxuICAgICAgdGltZXIudXBkYXRlKCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBzdGFydFJBRiAoKSB7XHJcbiAgICBpZiAoIWFjdGl2ZVJBRiAmJiByYWZDYWxsYmFja3MubGVuZ3RoID4gMCkge1xyXG4gICAgICBhY3RpdmVSQUYgPSByYWYubmV4dChoYW5kbGVSQUYpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gc3RvcFJBRiAoKSB7XHJcbiAgICBpZiAoYWN0aXZlUkFGKSB7XHJcbiAgICAgIHJhZi5jYW5jZWwoaGFuZGxlUkFGKTtcclxuICAgICAgYWN0aXZlUkFGID0gbnVsbDtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGhhbmRsZUNvbnRleHRMb3NzIChldmVudCkge1xyXG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuXHJcbiAgICAvLyBzZXQgY29udGV4dCBsb3N0IGZsYWdcclxuICAgIGNvbnRleHRMb3N0ID0gdHJ1ZTtcclxuXHJcbiAgICAvLyBwYXVzZSByZXF1ZXN0IGFuaW1hdGlvbiBmcmFtZVxyXG4gICAgc3RvcFJBRigpO1xyXG5cclxuICAgIC8vIGxvc2UgY29udGV4dFxyXG4gICAgbG9zc0NhbGxiYWNrcy5mb3JFYWNoKGZ1bmN0aW9uIChjYikge1xyXG4gICAgICBjYigpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBoYW5kbGVDb250ZXh0UmVzdG9yZWQgKGV2ZW50KSB7XHJcbiAgICAvLyBjbGVhciBlcnJvciBjb2RlXHJcbiAgICBnbC5nZXRFcnJvcigpO1xyXG5cclxuICAgIC8vIGNsZWFyIGNvbnRleHQgbG9zdCBmbGFnXHJcbiAgICBjb250ZXh0TG9zdCA9IGZhbHNlO1xyXG5cclxuICAgIC8vIHJlZnJlc2ggc3RhdGVcclxuICAgIGV4dGVuc2lvblN0YXRlLnJlc3RvcmUoKTtcclxuICAgIHNoYWRlclN0YXRlLnJlc3RvcmUoKTtcclxuICAgIGJ1ZmZlclN0YXRlLnJlc3RvcmUoKTtcclxuICAgIHRleHR1cmVTdGF0ZS5yZXN0b3JlKCk7XHJcbiAgICByZW5kZXJidWZmZXJTdGF0ZS5yZXN0b3JlKCk7XHJcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLnJlc3RvcmUoKTtcclxuICAgIGlmICh0aW1lcikge1xyXG4gICAgICB0aW1lci5yZXN0b3JlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gcmVmcmVzaCBzdGF0ZVxyXG4gICAgY29yZS5wcm9jcy5yZWZyZXNoKCk7XHJcblxyXG4gICAgLy8gcmVzdGFydCBSQUZcclxuICAgIHN0YXJ0UkFGKCk7XHJcblxyXG4gICAgLy8gcmVzdG9yZSBjb250ZXh0XHJcbiAgICByZXN0b3JlQ2FsbGJhY2tzLmZvckVhY2goZnVuY3Rpb24gKGNiKSB7XHJcbiAgICAgIGNiKCk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIGlmIChjYW52YXMpIHtcclxuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKENPTlRFWFRfTE9TVF9FVkVOVCwgaGFuZGxlQ29udGV4dExvc3MsIGZhbHNlKTtcclxuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKENPTlRFWFRfUkVTVE9SRURfRVZFTlQsIGhhbmRsZUNvbnRleHRSZXN0b3JlZCwgZmFsc2UpO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZGVzdHJveSAoKSB7XHJcbiAgICByYWZDYWxsYmFja3MubGVuZ3RoID0gMDtcclxuICAgIHN0b3BSQUYoKTtcclxuXHJcbiAgICBpZiAoY2FudmFzKSB7XHJcbiAgICAgIGNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKENPTlRFWFRfTE9TVF9FVkVOVCwgaGFuZGxlQ29udGV4dExvc3MpO1xyXG4gICAgICBjYW52YXMucmVtb3ZlRXZlbnRMaXN0ZW5lcihDT05URVhUX1JFU1RPUkVEX0VWRU5ULCBoYW5kbGVDb250ZXh0UmVzdG9yZWQpO1xyXG4gICAgfVxyXG5cclxuICAgIHNoYWRlclN0YXRlLmNsZWFyKCk7XHJcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLmNsZWFyKCk7XHJcbiAgICByZW5kZXJidWZmZXJTdGF0ZS5jbGVhcigpO1xyXG4gICAgdGV4dHVyZVN0YXRlLmNsZWFyKCk7XHJcbiAgICBlbGVtZW50U3RhdGUuY2xlYXIoKTtcclxuICAgIGJ1ZmZlclN0YXRlLmNsZWFyKCk7XHJcblxyXG4gICAgaWYgKHRpbWVyKSB7XHJcbiAgICAgIHRpbWVyLmNsZWFyKCk7XHJcbiAgICB9XHJcblxyXG4gICAgZGVzdHJveUNhbGxiYWNrcy5mb3JFYWNoKGZ1bmN0aW9uIChjYikge1xyXG4gICAgICBjYigpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBjb21waWxlUHJvY2VkdXJlIChvcHRpb25zKSB7XHJcbiAgICBjaGVjayQxKCEhb3B0aW9ucywgJ2ludmFsaWQgYXJncyB0byByZWdsKHsuLi59KScpO1xyXG4gICAgY2hlY2skMS50eXBlKG9wdGlvbnMsICdvYmplY3QnLCAnaW52YWxpZCBhcmdzIHRvIHJlZ2woey4uLn0pJyk7XHJcblxyXG4gICAgZnVuY3Rpb24gZmxhdHRlbk5lc3RlZE9wdGlvbnMgKG9wdGlvbnMpIHtcclxuICAgICAgdmFyIHJlc3VsdCA9IGV4dGVuZCh7fSwgb3B0aW9ucyk7XHJcbiAgICAgIGRlbGV0ZSByZXN1bHQudW5pZm9ybXM7XHJcbiAgICAgIGRlbGV0ZSByZXN1bHQuYXR0cmlidXRlcztcclxuICAgICAgZGVsZXRlIHJlc3VsdC5jb250ZXh0O1xyXG5cclxuICAgICAgaWYgKCdzdGVuY2lsJyBpbiByZXN1bHQgJiYgcmVzdWx0LnN0ZW5jaWwub3ApIHtcclxuICAgICAgICByZXN1bHQuc3RlbmNpbC5vcEJhY2sgPSByZXN1bHQuc3RlbmNpbC5vcEZyb250ID0gcmVzdWx0LnN0ZW5jaWwub3A7XHJcbiAgICAgICAgZGVsZXRlIHJlc3VsdC5zdGVuY2lsLm9wO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBmdW5jdGlvbiBtZXJnZSAobmFtZSkge1xyXG4gICAgICAgIGlmIChuYW1lIGluIHJlc3VsdCkge1xyXG4gICAgICAgICAgdmFyIGNoaWxkID0gcmVzdWx0W25hbWVdO1xyXG4gICAgICAgICAgZGVsZXRlIHJlc3VsdFtuYW1lXTtcclxuICAgICAgICAgIE9iamVjdC5rZXlzKGNoaWxkKS5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XHJcbiAgICAgICAgICAgIHJlc3VsdFtuYW1lICsgJy4nICsgcHJvcF0gPSBjaGlsZFtwcm9wXTtcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICBtZXJnZSgnYmxlbmQnKTtcclxuICAgICAgbWVyZ2UoJ2RlcHRoJyk7XHJcbiAgICAgIG1lcmdlKCdjdWxsJyk7XHJcbiAgICAgIG1lcmdlKCdzdGVuY2lsJyk7XHJcbiAgICAgIG1lcmdlKCdwb2x5Z29uT2Zmc2V0Jyk7XHJcbiAgICAgIG1lcmdlKCdzY2lzc29yJyk7XHJcbiAgICAgIG1lcmdlKCdzYW1wbGUnKTtcclxuXHJcbiAgICAgIHJldHVybiByZXN1bHRcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBzZXBhcmF0ZUR5bmFtaWMgKG9iamVjdCkge1xyXG4gICAgICB2YXIgc3RhdGljSXRlbXMgPSB7fTtcclxuICAgICAgdmFyIGR5bmFtaWNJdGVtcyA9IHt9O1xyXG4gICAgICBPYmplY3Qua2V5cyhvYmplY3QpLmZvckVhY2goZnVuY3Rpb24gKG9wdGlvbikge1xyXG4gICAgICAgIHZhciB2YWx1ZSA9IG9iamVjdFtvcHRpb25dO1xyXG4gICAgICAgIGlmIChkeW5hbWljLmlzRHluYW1pYyh2YWx1ZSkpIHtcclxuICAgICAgICAgIGR5bmFtaWNJdGVtc1tvcHRpb25dID0gZHluYW1pYy51bmJveCh2YWx1ZSwgb3B0aW9uKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgc3RhdGljSXRlbXNbb3B0aW9uXSA9IHZhbHVlO1xyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgZHluYW1pYzogZHluYW1pY0l0ZW1zLFxyXG4gICAgICAgIHN0YXRpYzogc3RhdGljSXRlbXNcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFRyZWF0IGNvbnRleHQgdmFyaWFibGVzIHNlcGFyYXRlIGZyb20gb3RoZXIgZHluYW1pYyB2YXJpYWJsZXNcclxuICAgIHZhciBjb250ZXh0ID0gc2VwYXJhdGVEeW5hbWljKG9wdGlvbnMuY29udGV4dCB8fCB7fSk7XHJcbiAgICB2YXIgdW5pZm9ybXMgPSBzZXBhcmF0ZUR5bmFtaWMob3B0aW9ucy51bmlmb3JtcyB8fCB7fSk7XHJcbiAgICB2YXIgYXR0cmlidXRlcyA9IHNlcGFyYXRlRHluYW1pYyhvcHRpb25zLmF0dHJpYnV0ZXMgfHwge30pO1xyXG4gICAgdmFyIG9wdHMgPSBzZXBhcmF0ZUR5bmFtaWMoZmxhdHRlbk5lc3RlZE9wdGlvbnMob3B0aW9ucykpO1xyXG5cclxuICAgIHZhciBzdGF0cyQkMSA9IHtcclxuICAgICAgZ3B1VGltZTogMC4wLFxyXG4gICAgICBjcHVUaW1lOiAwLjAsXHJcbiAgICAgIGNvdW50OiAwXHJcbiAgICB9O1xyXG5cclxuICAgIHZhciBjb21waWxlZCA9IGNvcmUuY29tcGlsZShvcHRzLCBhdHRyaWJ1dGVzLCB1bmlmb3JtcywgY29udGV4dCwgc3RhdHMkJDEpO1xyXG5cclxuICAgIHZhciBkcmF3ID0gY29tcGlsZWQuZHJhdztcclxuICAgIHZhciBiYXRjaCA9IGNvbXBpbGVkLmJhdGNoO1xyXG4gICAgdmFyIHNjb3BlID0gY29tcGlsZWQuc2NvcGU7XHJcblxyXG4gICAgLy8gRklYTUU6IHdlIHNob3VsZCBtb2RpZnkgY29kZSBnZW5lcmF0aW9uIGZvciBiYXRjaCBjb21tYW5kcyBzbyB0aGlzXHJcbiAgICAvLyBpc24ndCBuZWNlc3NhcnlcclxuICAgIHZhciBFTVBUWV9BUlJBWSA9IFtdO1xyXG4gICAgZnVuY3Rpb24gcmVzZXJ2ZSAoY291bnQpIHtcclxuICAgICAgd2hpbGUgKEVNUFRZX0FSUkFZLmxlbmd0aCA8IGNvdW50KSB7XHJcbiAgICAgICAgRU1QVFlfQVJSQVkucHVzaChudWxsKTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gRU1QVFlfQVJSQVlcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBSRUdMQ29tbWFuZCAoYXJncywgYm9keSkge1xyXG4gICAgICB2YXIgaTtcclxuICAgICAgaWYgKGNvbnRleHRMb3N0KSB7XHJcbiAgICAgICAgY2hlY2skMS5yYWlzZSgnY29udGV4dCBsb3N0Jyk7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKHR5cGVvZiBhcmdzID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgcmV0dXJuIHNjb3BlLmNhbGwodGhpcywgbnVsbCwgYXJncywgMClcclxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgYm9keSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIGlmICh0eXBlb2YgYXJncyA9PT0gJ251bWJlcicpIHtcclxuICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBhcmdzOyArK2kpIHtcclxuICAgICAgICAgICAgc2NvcGUuY2FsbCh0aGlzLCBudWxsLCBib2R5LCBpKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIHJldHVyblxyXG4gICAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShhcmdzKSkge1xyXG4gICAgICAgICAgZm9yIChpID0gMDsgaSA8IGFyZ3MubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgc2NvcGUuY2FsbCh0aGlzLCBhcmdzW2ldLCBib2R5LCBpKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIHJldHVyblxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICByZXR1cm4gc2NvcGUuY2FsbCh0aGlzLCBhcmdzLCBib2R5LCAwKVxyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgYXJncyA9PT0gJ251bWJlcicpIHtcclxuICAgICAgICBpZiAoYXJncyA+IDApIHtcclxuICAgICAgICAgIHJldHVybiBiYXRjaC5jYWxsKHRoaXMsIHJlc2VydmUoYXJncyB8IDApLCBhcmdzIHwgMClcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShhcmdzKSkge1xyXG4gICAgICAgIGlmIChhcmdzLmxlbmd0aCkge1xyXG4gICAgICAgICAgcmV0dXJuIGJhdGNoLmNhbGwodGhpcywgYXJncywgYXJncy5sZW5ndGgpXHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHJldHVybiBkcmF3LmNhbGwodGhpcywgYXJncylcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBleHRlbmQoUkVHTENvbW1hbmQsIHtcclxuICAgICAgc3RhdHM6IHN0YXRzJCQxXHJcbiAgICB9KVxyXG4gIH1cclxuXHJcbiAgdmFyIHNldEZCTyA9IGZyYW1lYnVmZmVyU3RhdGUuc2V0RkJPID0gY29tcGlsZVByb2NlZHVyZSh7XHJcbiAgICBmcmFtZWJ1ZmZlcjogZHluYW1pYy5kZWZpbmUuY2FsbChudWxsLCBEWU5fUFJPUCwgJ2ZyYW1lYnVmZmVyJylcclxuICB9KTtcclxuXHJcbiAgZnVuY3Rpb24gY2xlYXJJbXBsIChfLCBvcHRpb25zKSB7XHJcbiAgICB2YXIgY2xlYXJGbGFncyA9IDA7XHJcbiAgICBjb3JlLnByb2NzLnBvbGwoKTtcclxuXHJcbiAgICB2YXIgYyA9IG9wdGlvbnMuY29sb3I7XHJcbiAgICBpZiAoYykge1xyXG4gICAgICBnbC5jbGVhckNvbG9yKCtjWzBdIHx8IDAsICtjWzFdIHx8IDAsICtjWzJdIHx8IDAsICtjWzNdIHx8IDApO1xyXG4gICAgICBjbGVhckZsYWdzIHw9IEdMX0NPTE9SX0JVRkZFUl9CSVQ7XHJcbiAgICB9XHJcbiAgICBpZiAoJ2RlcHRoJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgIGdsLmNsZWFyRGVwdGgoK29wdGlvbnMuZGVwdGgpO1xyXG4gICAgICBjbGVhckZsYWdzIHw9IEdMX0RFUFRIX0JVRkZFUl9CSVQ7XHJcbiAgICB9XHJcbiAgICBpZiAoJ3N0ZW5jaWwnIGluIG9wdGlvbnMpIHtcclxuICAgICAgZ2wuY2xlYXJTdGVuY2lsKG9wdGlvbnMuc3RlbmNpbCB8IDApO1xyXG4gICAgICBjbGVhckZsYWdzIHw9IEdMX1NURU5DSUxfQlVGRkVSX0JJVDtcclxuICAgIH1cclxuXHJcbiAgICBjaGVjayQxKCEhY2xlYXJGbGFncywgJ2NhbGxlZCByZWdsLmNsZWFyIHdpdGggbm8gYnVmZmVyIHNwZWNpZmllZCcpO1xyXG4gICAgZ2wuY2xlYXIoY2xlYXJGbGFncyk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBjbGVhciAob3B0aW9ucykge1xyXG4gICAgY2hlY2skMShcclxuICAgICAgdHlwZW9mIG9wdGlvbnMgPT09ICdvYmplY3QnICYmIG9wdGlvbnMsXHJcbiAgICAgICdyZWdsLmNsZWFyKCkgdGFrZXMgYW4gb2JqZWN0IGFzIGlucHV0Jyk7XHJcbiAgICBpZiAoJ2ZyYW1lYnVmZmVyJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgIGlmIChvcHRpb25zLmZyYW1lYnVmZmVyICYmXHJcbiAgICAgICAgICBvcHRpb25zLmZyYW1lYnVmZmVyX3JlZ2xUeXBlID09PSAnZnJhbWVidWZmZXJDdWJlJykge1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgNjsgKytpKSB7XHJcbiAgICAgICAgICBzZXRGQk8oZXh0ZW5kKHtcclxuICAgICAgICAgICAgZnJhbWVidWZmZXI6IG9wdGlvbnMuZnJhbWVidWZmZXIuZmFjZXNbaV1cclxuICAgICAgICAgIH0sIG9wdGlvbnMpLCBjbGVhckltcGwpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBzZXRGQk8ob3B0aW9ucywgY2xlYXJJbXBsKTtcclxuICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY2xlYXJJbXBsKG51bGwsIG9wdGlvbnMpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZnJhbWUgKGNiKSB7XHJcbiAgICBjaGVjayQxLnR5cGUoY2IsICdmdW5jdGlvbicsICdyZWdsLmZyYW1lKCkgY2FsbGJhY2sgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XHJcbiAgICByYWZDYWxsYmFja3MucHVzaChjYik7XHJcblxyXG4gICAgZnVuY3Rpb24gY2FuY2VsICgpIHtcclxuICAgICAgLy8gRklYTUU6ICBzaG91bGQgd2UgY2hlY2sgc29tZXRoaW5nIG90aGVyIHRoYW4gZXF1YWxzIGNiIGhlcmU/XHJcbiAgICAgIC8vIHdoYXQgaWYgYSB1c2VyIGNhbGxzIGZyYW1lIHR3aWNlIHdpdGggdGhlIHNhbWUgY2FsbGJhY2suLi5cclxuICAgICAgLy9cclxuICAgICAgdmFyIGkgPSBmaW5kKHJhZkNhbGxiYWNrcywgY2IpO1xyXG4gICAgICBjaGVjayQxKGkgPj0gMCwgJ2Nhbm5vdCBjYW5jZWwgYSBmcmFtZSB0d2ljZScpO1xyXG4gICAgICBmdW5jdGlvbiBwZW5kaW5nQ2FuY2VsICgpIHtcclxuICAgICAgICB2YXIgaW5kZXggPSBmaW5kKHJhZkNhbGxiYWNrcywgcGVuZGluZ0NhbmNlbCk7XHJcbiAgICAgICAgcmFmQ2FsbGJhY2tzW2luZGV4XSA9IHJhZkNhbGxiYWNrc1tyYWZDYWxsYmFja3MubGVuZ3RoIC0gMV07XHJcbiAgICAgICAgcmFmQ2FsbGJhY2tzLmxlbmd0aCAtPSAxO1xyXG4gICAgICAgIGlmIChyYWZDYWxsYmFja3MubGVuZ3RoIDw9IDApIHtcclxuICAgICAgICAgIHN0b3BSQUYoKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgcmFmQ2FsbGJhY2tzW2ldID0gcGVuZGluZ0NhbmNlbDtcclxuICAgIH1cclxuXHJcbiAgICBzdGFydFJBRigpO1xyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgIGNhbmNlbDogY2FuY2VsXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvLyBwb2xsIHZpZXdwb3J0XHJcbiAgZnVuY3Rpb24gcG9sbFZpZXdwb3J0ICgpIHtcclxuICAgIHZhciB2aWV3cG9ydCA9IG5leHRTdGF0ZS52aWV3cG9ydDtcclxuICAgIHZhciBzY2lzc29yQm94ID0gbmV4dFN0YXRlLnNjaXNzb3JfYm94O1xyXG4gICAgdmlld3BvcnRbMF0gPSB2aWV3cG9ydFsxXSA9IHNjaXNzb3JCb3hbMF0gPSBzY2lzc29yQm94WzFdID0gMDtcclxuICAgIGNvbnRleHRTdGF0ZS52aWV3cG9ydFdpZHRoID1cclxuICAgICAgY29udGV4dFN0YXRlLmZyYW1lYnVmZmVyV2lkdGggPVxyXG4gICAgICBjb250ZXh0U3RhdGUuZHJhd2luZ0J1ZmZlcldpZHRoID1cclxuICAgICAgdmlld3BvcnRbMl0gPVxyXG4gICAgICBzY2lzc29yQm94WzJdID0gZ2wuZHJhd2luZ0J1ZmZlcldpZHRoO1xyXG4gICAgY29udGV4dFN0YXRlLnZpZXdwb3J0SGVpZ2h0ID1cclxuICAgICAgY29udGV4dFN0YXRlLmZyYW1lYnVmZmVySGVpZ2h0ID1cclxuICAgICAgY29udGV4dFN0YXRlLmRyYXdpbmdCdWZmZXJIZWlnaHQgPVxyXG4gICAgICB2aWV3cG9ydFszXSA9XHJcbiAgICAgIHNjaXNzb3JCb3hbM10gPSBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0O1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gcG9sbCAoKSB7XHJcbiAgICBjb250ZXh0U3RhdGUudGljayArPSAxO1xyXG4gICAgY29udGV4dFN0YXRlLnRpbWUgPSBub3coKTtcclxuICAgIHBvbGxWaWV3cG9ydCgpO1xyXG4gICAgY29yZS5wcm9jcy5wb2xsKCk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiByZWZyZXNoICgpIHtcclxuICAgIHBvbGxWaWV3cG9ydCgpO1xyXG4gICAgY29yZS5wcm9jcy5yZWZyZXNoKCk7XHJcbiAgICBpZiAodGltZXIpIHtcclxuICAgICAgdGltZXIudXBkYXRlKCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBub3cgKCkge1xyXG4gICAgcmV0dXJuIChjbG9jaygpIC0gU1RBUlRfVElNRSkgLyAxMDAwLjBcclxuICB9XHJcblxyXG4gIHJlZnJlc2goKTtcclxuXHJcbiAgZnVuY3Rpb24gYWRkTGlzdGVuZXIgKGV2ZW50LCBjYWxsYmFjaykge1xyXG4gICAgY2hlY2skMS50eXBlKGNhbGxiYWNrLCAnZnVuY3Rpb24nLCAnbGlzdGVuZXIgY2FsbGJhY2sgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XHJcblxyXG4gICAgdmFyIGNhbGxiYWNrcztcclxuICAgIHN3aXRjaCAoZXZlbnQpIHtcclxuICAgICAgY2FzZSAnZnJhbWUnOlxyXG4gICAgICAgIHJldHVybiBmcmFtZShjYWxsYmFjaylcclxuICAgICAgY2FzZSAnbG9zdCc6XHJcbiAgICAgICAgY2FsbGJhY2tzID0gbG9zc0NhbGxiYWNrcztcclxuICAgICAgICBicmVha1xyXG4gICAgICBjYXNlICdyZXN0b3JlJzpcclxuICAgICAgICBjYWxsYmFja3MgPSByZXN0b3JlQ2FsbGJhY2tzO1xyXG4gICAgICAgIGJyZWFrXHJcbiAgICAgIGNhc2UgJ2Rlc3Ryb3knOlxyXG4gICAgICAgIGNhbGxiYWNrcyA9IGRlc3Ryb3lDYWxsYmFja3M7XHJcbiAgICAgICAgYnJlYWtcclxuICAgICAgZGVmYXVsdDpcclxuICAgICAgICBjaGVjayQxLnJhaXNlKCdpbnZhbGlkIGV2ZW50LCBtdXN0IGJlIG9uZSBvZiBmcmFtZSxsb3N0LHJlc3RvcmUsZGVzdHJveScpO1xyXG4gICAgfVxyXG5cclxuICAgIGNhbGxiYWNrcy5wdXNoKGNhbGxiYWNrKTtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGNhbmNlbDogZnVuY3Rpb24gKCkge1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2FsbGJhY2tzLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgICBpZiAoY2FsbGJhY2tzW2ldID09PSBjYWxsYmFjaykge1xyXG4gICAgICAgICAgICBjYWxsYmFja3NbaV0gPSBjYWxsYmFja3NbY2FsbGJhY2tzLmxlbmd0aCAtIDFdO1xyXG4gICAgICAgICAgICBjYWxsYmFja3MucG9wKCk7XHJcbiAgICAgICAgICAgIHJldHVyblxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgdmFyIHJlZ2wgPSBleHRlbmQoY29tcGlsZVByb2NlZHVyZSwge1xyXG4gICAgLy8gQ2xlYXIgY3VycmVudCBGQk9cclxuICAgIGNsZWFyOiBjbGVhcixcclxuXHJcbiAgICAvLyBTaG9ydCBjdXRzIGZvciBkeW5hbWljIHZhcmlhYmxlc1xyXG4gICAgcHJvcDogZHluYW1pYy5kZWZpbmUuYmluZChudWxsLCBEWU5fUFJPUCksXHJcbiAgICBjb250ZXh0OiBkeW5hbWljLmRlZmluZS5iaW5kKG51bGwsIERZTl9DT05URVhUKSxcclxuICAgIHRoaXM6IGR5bmFtaWMuZGVmaW5lLmJpbmQobnVsbCwgRFlOX1NUQVRFKSxcclxuXHJcbiAgICAvLyBleGVjdXRlcyBhbiBlbXB0eSBkcmF3IGNvbW1hbmRcclxuICAgIGRyYXc6IGNvbXBpbGVQcm9jZWR1cmUoe30pLFxyXG5cclxuICAgIC8vIFJlc291cmNlc1xyXG4gICAgYnVmZmVyOiBmdW5jdGlvbiAob3B0aW9ucykge1xyXG4gICAgICByZXR1cm4gYnVmZmVyU3RhdGUuY3JlYXRlKG9wdGlvbnMsIEdMX0FSUkFZX0JVRkZFUiwgZmFsc2UsIGZhbHNlKVxyXG4gICAgfSxcclxuICAgIGVsZW1lbnRzOiBmdW5jdGlvbiAob3B0aW9ucykge1xyXG4gICAgICByZXR1cm4gZWxlbWVudFN0YXRlLmNyZWF0ZShvcHRpb25zLCBmYWxzZSlcclxuICAgIH0sXHJcbiAgICB0ZXh0dXJlOiB0ZXh0dXJlU3RhdGUuY3JlYXRlMkQsXHJcbiAgICBjdWJlOiB0ZXh0dXJlU3RhdGUuY3JlYXRlQ3ViZSxcclxuICAgIHJlbmRlcmJ1ZmZlcjogcmVuZGVyYnVmZmVyU3RhdGUuY3JlYXRlLFxyXG4gICAgZnJhbWVidWZmZXI6IGZyYW1lYnVmZmVyU3RhdGUuY3JlYXRlLFxyXG4gICAgZnJhbWVidWZmZXJDdWJlOiBmcmFtZWJ1ZmZlclN0YXRlLmNyZWF0ZUN1YmUsXHJcblxyXG4gICAgLy8gRXhwb3NlIGNvbnRleHQgYXR0cmlidXRlc1xyXG4gICAgYXR0cmlidXRlczogZ2xBdHRyaWJ1dGVzLFxyXG5cclxuICAgIC8vIEZyYW1lIHJlbmRlcmluZ1xyXG4gICAgZnJhbWU6IGZyYW1lLFxyXG4gICAgb246IGFkZExpc3RlbmVyLFxyXG5cclxuICAgIC8vIFN5c3RlbSBsaW1pdHNcclxuICAgIGxpbWl0czogbGltaXRzLFxyXG4gICAgaGFzRXh0ZW5zaW9uOiBmdW5jdGlvbiAobmFtZSkge1xyXG4gICAgICByZXR1cm4gbGltaXRzLmV4dGVuc2lvbnMuaW5kZXhPZihuYW1lLnRvTG93ZXJDYXNlKCkpID49IDBcclxuICAgIH0sXHJcblxyXG4gICAgLy8gUmVhZCBwaXhlbHNcclxuICAgIHJlYWQ6IHJlYWRQaXhlbHMsXHJcblxyXG4gICAgLy8gRGVzdHJveSByZWdsIGFuZCBhbGwgYXNzb2NpYXRlZCByZXNvdXJjZXNcclxuICAgIGRlc3Ryb3k6IGRlc3Ryb3ksXHJcblxyXG4gICAgLy8gRGlyZWN0IEdMIHN0YXRlIG1hbmlwdWxhdGlvblxyXG4gICAgX2dsOiBnbCxcclxuICAgIF9yZWZyZXNoOiByZWZyZXNoLFxyXG5cclxuICAgIHBvbGw6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgcG9sbCgpO1xyXG4gICAgICBpZiAodGltZXIpIHtcclxuICAgICAgICB0aW1lci51cGRhdGUoKTtcclxuICAgICAgfVxyXG4gICAgfSxcclxuXHJcbiAgICAvLyBDdXJyZW50IHRpbWVcclxuICAgIG5vdzogbm93LFxyXG5cclxuICAgIC8vIHJlZ2wgU3RhdGlzdGljcyBJbmZvcm1hdGlvblxyXG4gICAgc3RhdHM6IHN0YXRzJCQxXHJcbiAgfSk7XHJcblxyXG4gIGNvbmZpZy5vbkRvbmUobnVsbCwgcmVnbCk7XHJcblxyXG4gIHJldHVybiByZWdsXHJcbn1cblxucmV0dXJuIHdyYXBSRUdMO1xuXG59KSkpO1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9cmVnbC5qcy5tYXBcbiIsIm1vZHVsZS5leHBvcnRzID0gKHJlZ2wpID0+IHtcbiAgICByZXR1cm4gcmVnbCh7XG4gICAgICAgIHZlcnQ6IGBcbiAgICAgICAgICAgIHByZWNpc2lvbiBtZWRpdW1wIGZsb2F0O1xuICAgICAgICAgICAgYXR0cmlidXRlIHZlYzIgeHk7XG4gICAgICAgICAgICB2YXJ5aW5nIHZlYzIgdXY7XG4gICAgICAgICAgICB2b2lkIG1haW4gKCkge1xuICAgICAgICAgICAgICAgIHV2ID0geHkgKiAwLjUgKyAwLjU7XG4gICAgICAgICAgICAgICAgdXYueSA9IDEuMC11di55O1xuICAgICAgICAgICAgICAgIGdsX1Bvc2l0aW9uID0gdmVjNCh4eSwgMCwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIGAsXG4gICAgICAgIGZyYWc6IGBcbiAgICAgICAgICAgIHByZWNpc2lvbiBtZWRpdW1wIGZsb2F0O1xuICAgICAgICAgICAgdmFyeWluZyB2ZWMyIHV2O1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWM0IHJlY3Q7XG5cbiAgICAgICAgICAgIHZvaWQgbWFpbiAoKSB7XG4gICAgICAgICAgICAgICAgaWYgKHV2LnggPCByZWN0LngpIGRpc2NhcmQ7XG4gICAgICAgICAgICAgICAgaWYgKHV2LnggPiByZWN0LnopIGRpc2NhcmQ7XG4gICAgICAgICAgICAgICAgaWYgKHV2LnkgPiAxLjAgLSByZWN0LnkpIGRpc2NhcmQ7XG4gICAgICAgICAgICAgICAgaWYgKHV2LnkgPCAxLjAgLSByZWN0LncpIGRpc2NhcmQ7XG4gICAgICAgICAgICAgICAgZ2xfRnJhZ0NvbG9yID0gdmVjNCgwLjAsIDAuMCwgMC4wLCAwLjApO1xuICAgICAgICAgICAgICAgIC8vIGlmICh1di55ID09IDEuMCAtIHJlY3QueSkge1xuICAgICAgICAgICAgICAgIC8vICAgICAvLyBnbF9GcmFnQ29sb3IgPSB2ZWM0KHJhbmQodXYsIDEuMCksIHJhbmQodXYsIDIuMCkqMC4yNSwgcmFuZCh1diwgMi4wKSwgcmFuZCh1diwgMy4wKSowLjI1KTtcbiAgICAgICAgICAgICAgICAvLyB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vICAgICAvLyBnbF9GcmFnQ29sb3IgPSB2ZWM0KHJhbmQodXYsIDEuMCksIHJhbmQodXYsIDIuMCkqMC4yNSwgcmFuZCh1diwgMi4wKSwgcmFuZCh1diwgMy4wKSowLjI1KTtcbiAgICAgICAgICAgICAgICAvLyAgICAgLy8gZ2xfRnJhZ0NvbG9yID0gdmVjNCgwLjAsIDAuMCwgMC4wLCAwLjApO1xuICAgICAgICAgICAgICAgIC8vIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgYCxcbiAgICAgICAgYXR0cmlidXRlczoge3h5OiBbLTQsIC00LCAwLCA0LCA0LCAtNF19LFxuICAgICAgICB1bmlmb3Jtczoge1xuICAgICAgICAgICAgcmVjdDogcmVnbC5wcm9wKCdyZWN0JylcbiAgICAgICAgfSxcbiAgICAgICAgZnJhbWVidWZmZXI6IHJlZ2wucHJvcCgnZHN0JyksXG4gICAgICAgIGRlcHRoOiB7IGVuYWJsZTogZmFsc2UgfSxcbiAgICAgICAgY291bnQ6IDMsXG4gICAgfSk7XG59IiwiY29uc3QgZ2xzbCA9IHJlcXVpcmUoJ2dsc2xpZnknKVxuXG5tb2R1bGUuZXhwb3J0cyA9IChyZWdsKSA9PiB7XG4gICAgcmV0dXJuIHJlZ2woe1xuICAgICAgICB2ZXJ0OiBgXG4gICAgICAgICAgICBwcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcbiAgICAgICAgICAgIGF0dHJpYnV0ZSB2ZWMyIHh5O1xuICAgICAgICAgICAgdmFyeWluZyB2ZWMyIHV2O1xuICAgICAgICAgICAgdm9pZCBtYWluICgpIHtcbiAgICAgICAgICAgICAgICB1diA9IHh5ICogMC41ICsgMC41O1xuICAgICAgICAgICAgICAgIGdsX1Bvc2l0aW9uID0gdmVjNCh4eSwgMCwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIGAsXG4gICAgICAgIGZyYWc6IGdsc2xgXG4gICAgICAgICAgICBwcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcbiAgICAgICAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIHVfc3JjO1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWMyIHVfc2l6ZTtcbiAgICAgICAgICAgIHVuaWZvcm0gZmxvYXQgc2NhbGU7XG4gICAgICAgICAgICB2YXJ5aW5nIHZlYzIgdXY7XG4gICAgICAgICAgICBjb25zdCBmbG9hdCBGID0gMC4wMzcsIEsgPSAwLjA2O1xuICAgICAgICAgICAgZmxvYXQgRF9hID0gMC4yKnNjYWxlLCBEX2IgPSAwLjEqc2NhbGU7XG5cbiAgICAgICAgICAgIHZvaWQgbWFpbigpIHtcbiAgICAgICAgICAgICAgICB2ZWM0IG4gPSB0ZXh0dXJlMkQodV9zcmMsIHV2ICsgdmVjMigwLjAsIDEuMCkqdV9zaXplKSxcbiAgICAgICAgICAgICAgICAgICAgIGUgPSB0ZXh0dXJlMkQodV9zcmMsIHV2ICsgdmVjMigxLjAsIDAuMCkqdV9zaXplKSxcbiAgICAgICAgICAgICAgICAgICAgIHMgPSB0ZXh0dXJlMkQodV9zcmMsIHV2ICsgdmVjMigwLjAsIC0xLjApKnVfc2l6ZSksXG4gICAgICAgICAgICAgICAgICAgICB3ID0gdGV4dHVyZTJEKHVfc3JjLCB1diArIHZlYzIoLTEuMCwgMC4wKSp1X3NpemUpLFxuXG4gICAgICAgICAgICAgICAgICAgICBuZSA9IHRleHR1cmUyRCh1X3NyYywgdXYgKyB2ZWMyKDEuMCwgMS4wKSp1X3NpemUpLFxuICAgICAgICAgICAgICAgICAgICAgbncgPSB0ZXh0dXJlMkQodV9zcmMsIHV2ICsgdmVjMigtMS4wLCAxLjApKnVfc2l6ZSksXG4gICAgICAgICAgICAgICAgICAgICBzZSA9IHRleHR1cmUyRCh1X3NyYywgdXYgKyB2ZWMyKDEuMCwgLTEuMCkqdV9zaXplKSxcbiAgICAgICAgICAgICAgICAgICAgIHN3ID0gdGV4dHVyZTJEKHVfc3JjLCB1diArIHZlYzIoLTEuMCwgLTEuMCkqdV9zaXplKTtcblxuICAgICAgICAgICAgICAgIHZlYzQgdmFsID0gdGV4dHVyZTJEKHVfc3JjLCB1dik7XG5cbiAgICAgICAgICAgICAgICB2ZWM0IGxhcCA9ICgwLjUgKiAobiArIHMgKyBlICsgdykgKyAwLjI1ICogKG5lICsgbncgKyBzZSArIHN3KSAtIDMuMCAqIHZhbCk7XG5cbiAgICAgICAgICAgICAgICB2YWwgKz0gdmVjNChEX2EgKiBsYXAueCAtIHZhbC54KnZhbC55KnZhbC55ICsgRiAqICgxLjAtdmFsLngpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIERfYiAqIGxhcC55ICsgdmFsLngqdmFsLnkqdmFsLnkgLSAoSytGKSAqIHZhbC55LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDEuNSpEX2EgKiBsYXAueiAtIHZhbC56KnZhbC53KnZhbC53ICsgRiAqICgxLjAtdmFsLnopLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDEuNSpEX2IgKiBsYXAudyArIHZhbC56KnZhbC53KnZhbC53IC0gKEsrRikgKiB2YWwudyk7XG5cbiAgICAgICAgICAgICAgICAvKiAgTWFrZSB0aGUgdHdvIHN5c3RlbXMgbXV0dWFsbHkgZXhjbHVzaXZlIGJ5IGhhdmluZyB0aGVcbiAgICAgICAgICAgICAgICAgICAgZG9taW5hbnQgc3VwcHJlc3MgdGhlIG90aGVyLiAqL1xuICAgICAgICAgICAgICAgIGlmICh2YWwueSA+IHZhbC53KSB7XG4gICAgICAgICAgICAgICAgICAgIGdsX0ZyYWdDb2xvciA9IHZlYzQodmFsLngsIHZhbC55LCB2YWwueiwgdmFsLncvMi4wKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBnbF9GcmFnQ29sb3IgPSB2ZWM0KHZhbC54LCB2YWwueS8yLjAsIHZhbC56LCB2YWwudyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICBgLFxuICAgICAgICBhdHRyaWJ1dGVzOiB7eHk6IFstNCwgLTQsIDAsIDQsIDQsIC00XX0sXG4gICAgICAgIHVuaWZvcm1zOiB7XG4gICAgICAgICAgICBzY2FsZTogMC4zLFxuICAgICAgICAgICAgdV9zcmM6IHJlZ2wucHJvcCgnc3JjJyksXG4gICAgICAgICAgICB1X3NpemU6IGN0eCA9PiBbMSAvIGN0eC5mcmFtZWJ1ZmZlcldpZHRoLCAxIC8gY3R4LmZyYW1lYnVmZmVySGVpZ2h0XSxcbiAgICAgICAgfSxcbiAgICAgICAgZnJhbWVidWZmZXI6IHJlZ2wucHJvcCgnZHN0JyksXG4gICAgICAgIGRlcHRoOiB7IGVuYWJsZTogZmFsc2UgfSxcbiAgICAgICAgY291bnQ6IDNcbiAgICB9KTtcbn0iLCJcbmZ1bmN0aW9uIGhleFRvUmdiKGhleCkge1xuICAgIHZhciByZXN1bHQgPSAvXiM/KFthLWZcXGRdezJ9KShbYS1mXFxkXXsyfSkoW2EtZlxcZF17Mn0pJC9pLmV4ZWMoaGV4KTtcbiAgICBpZiAoIXJlc3VsdCkgeyByZXR1cm4gbnVsbCB9XG4gICAgcmV0dXJuICBbXG4gICAgICAgIHBhcnNlSW50KHJlc3VsdFsxXSwgMTYpIC8gMjU1LjAsXG4gICAgICAgIHBhcnNlSW50KHJlc3VsdFsyXSwgMTYpIC8gMjU1LjAsXG4gICAgICAgIHBhcnNlSW50KHJlc3VsdFszXSwgMTYpIC8gMjU1LjAsXG4gICAgICAgIDEuMFxuICAgIF1cbn1cbm1vZHVsZS5leHBvcnRzID0gKHJlZ2wpID0+IHtcbiAgICByZXR1cm4gcmVnbCh7XG4gICAgICAgIHZlcnQ6IGBcbiAgICAgICAgICAgIHByZWNpc2lvbiBtZWRpdW1wIGZsb2F0O1xuICAgICAgICAgICAgYXR0cmlidXRlIHZlYzIgeHk7XG4gICAgICAgICAgICB2YXJ5aW5nIHZlYzIgdXY7XG4gICAgICAgICAgICB2b2lkIG1haW4gKCkge1xuICAgICAgICAgICAgICAgIHV2ID0geHkgKiAwLjUgKyAwLjU7XG4gICAgICAgICAgICAgICAgdXYueSA9IDEuMC11di55O1xuICAgICAgICAgICAgICAgIGdsX1Bvc2l0aW9uID0gdmVjNCh4eSwgMCwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIGAsXG4gICAgICAgIGZyYWc6IGBcbiAgICAgICAgICAgIHByZWNpc2lvbiBtZWRpdW1wIGZsb2F0O1xuICAgICAgICAgICAgdmFyeWluZyB2ZWMyIHV2O1xuICAgICAgICAgICAgdW5pZm9ybSBzYW1wbGVyMkQgc3JjO1xuICAgICAgICAgICAgdW5pZm9ybSBpbnQgc2hvdztcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjNCBjb2xvckE7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzQgY29sb3JCO1xuXG4gICAgICAgICAgICBjb25zdCBmbG9hdCBDT0xPUl9NSU4gPSAwLjE1LCBDT0xPUl9NQVggPSAwLjM7XG4gICAgICAgICAgICBjb25zdCB2ZWM0IFdISVRFID0gdmVjNCggMS4wLCAxLjAsIDEuMCwgMS4wICk7XG5cbiAgICAgICAgICAgIGZsb2F0IHJlbWFwKCBmbG9hdCBtaW52YWwsIGZsb2F0IG1heHZhbCwgZmxvYXQgY3VydmFsICkge1xuICAgICAgICAgICAgICAgIHJldHVybiAoIGN1cnZhbCAtIG1pbnZhbCApIC8gKCBtYXh2YWwgLSBtaW52YWwgKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdm9pZCBtYWluKCkge1xuICAgICAgICAgICAgICAgIHZlYzQgcGl4ZWwgPSB0ZXh0dXJlMkQoc3JjLCB1dik7XG4gICAgICAgICAgICAgICAgZmxvYXQgdjEgPSByZW1hcChDT0xPUl9NSU4sIENPTE9SX01BWCwgcGl4ZWwueSk7XG4gICAgICAgICAgICAgICAgZmxvYXQgdjIgPSByZW1hcChDT0xPUl9NSU4sIENPTE9SX01BWCwgcGl4ZWwudyk7XG5cbiAgICAgICAgICAgICAgICBpZiAoc2hvdyA9PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIGdsX0ZyYWdDb2xvciA9IG1peCggV0hJVEUsIGNvbG9yQSwgdjEgKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHNob3cgPT0gMikge1xuICAgICAgICAgICAgICAgICAgICBnbF9GcmFnQ29sb3IgPSBtaXgoIFdISVRFLCBjb2xvckIsIHYyICk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChzaG93ID09IDMpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHYyIDwgdjEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGdsX0ZyYWdDb2xvciA9IG1peCggV0hJVEUsIGNvbG9yQSwgdjEgKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGdsX0ZyYWdDb2xvciA9IG1peCggV0hJVEUsIGNvbG9yQiwgdjIgKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGdsX0ZyYWdDb2xvciA9IHZlYzQoMSwgMSwgMSwgMSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICBgLFxuICAgICAgICB1bmlmb3Jtczoge1xuICAgICAgICAgICAgY29sb3JBOiByZWdsLnByb3AoJ2NvbG9yQScpLC8vaGV4VG9SZ2IoXCIjMDAwMGUwXCIpLFxuICAgICAgICAgICAgY29sb3JCOiByZWdsLnByb3AoJ2NvbG9yQicpLFxuICAgICAgICAgICAgc3JjOiByZWdsLnByb3AoJ3NyYycpLFxuICAgICAgICAgICAgc2hvdzogMyxcbiAgICAgICAgfSxcbiAgICAgICAgYXR0cmlidXRlczoge3h5OiBbLTQsIC00LCAwLCA0LCA0LCAtNF19LFxuICAgICAgICBkZXB0aDoge2VuYWJsZTogZmFsc2V9LFxuICAgICAgICBjb3VudDogM1xuICAgIH0pO1xufSIsIm1vZHVsZS5leHBvcnRzID0gKHJlZ2wpID0+IHtcbiAgICByZXR1cm4gcmVnbCh7XG4gICAgICAgIHZlcnQ6IGBcbiAgICAgICAgICAgIHByZWNpc2lvbiBtZWRpdW1wIGZsb2F0O1xuICAgICAgICAgICAgYXR0cmlidXRlIHZlYzIgeHk7XG4gICAgICAgICAgICB2YXJ5aW5nIHZlYzIgdXY7XG4gICAgICAgICAgICB2b2lkIG1haW4gKCkge1xuICAgICAgICAgICAgICAgIHV2ID0geHkgKiAwLjUgKyAwLjU7XG4gICAgICAgICAgICAgICAgLy8gdXYueSA9IDEuMC11di55O1xuICAgICAgICAgICAgICAgIGdsX1Bvc2l0aW9uID0gdmVjNCh4eSwgMCwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIGAsXG4gICAgICAgIGZyYWc6IGBcbiAgICAgICAgICAgIHByZWNpc2lvbiBtZWRpdW1wIGZsb2F0O1xuICAgICAgICAgICAgdW5pZm9ybSBzYW1wbGVyMkQgdGV4dHVyZTtcbiAgICAgICAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIHJhbmRvbTtcbiAgICAgICAgICAgIHZhcnlpbmcgdmVjMiB1djtcblxuICAgICAgICAgICAgdm9pZCBtYWluICgpIHtcbiAgICAgICAgICAgICAgICB2ZWM0IHZhbCA9IHRleHR1cmUyRCh0ZXh0dXJlLCB1dik7XG4gICAgICAgICAgICAgICAgdmVjNCByYW5kID0gdGV4dHVyZTJEKHJhbmRvbSwgdXYpO1xuXG4gICAgICAgICAgICAgICAgdmVjNCByZXN1bHQgPSB2ZWM0KDEuMCwgMC4wLCAxLjAsIDAuMCk7XG5cbiAgICAgICAgICAgICAgICBpZiAodmFsLmcgPiAwLjUgJiYgcmFuZC54ID4gMC41KSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdC54ID0gMC41O1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQueSA9IDAuMjU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICh2YWwuciA+IDAuNSAmJiByYW5kLnkgPiAwLjcpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0LnogPSAwLjU7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdC53ID0gMC4yNTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZ2xfRnJhZ0NvbG9yID0gcmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICBgLFxuICAgICAgICBhdHRyaWJ1dGVzOiB7eHk6IFstNCwgLTQsIDAsIDQsIDQsIC00XX0sXG4gICAgICAgIHVuaWZvcm1zOiB7XG4gICAgICAgICAgICB0ZXh0dXJlOiByZWdsLnByb3AoJ3RleHR1cmUnKSxcbiAgICAgICAgICAgIHJhbmRvbTogcmVnbC5wcm9wKCdyYW5kb20nKVxuICAgICAgICB9LFxuICAgICAgICBmcmFtZWJ1ZmZlcjogcmVnbC5wcm9wKCdkc3QnKSxcbiAgICAgICAgZGVwdGg6IHsgZW5hYmxlOiBmYWxzZSB9LFxuICAgICAgICBjb3VudDogMyxcbiAgICB9KTtcbn0iLCJtb2R1bGUuZXhwb3J0cyA9IChyZWdsKSA9PiB7XG4gICAgcmV0dXJuIHJlZ2woe1xuICAgICAgICB2ZXJ0OiBgXG4gICAgICAgICAgICBwcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcbiAgICAgICAgICAgIGF0dHJpYnV0ZSB2ZWMyIHh5O1xuICAgICAgICAgICAgdmFyeWluZyB2ZWMyIHV2O1xuICAgICAgICAgICAgdm9pZCBtYWluICgpIHtcbiAgICAgICAgICAgICAgICB1diA9IHh5ICogMC41ICsgMC41O1xuICAgICAgICAgICAgICAgIC8vIHV2LnkgPSAxLjAgLSB1di55O1xuICAgICAgICAgICAgICAgIGdsX1Bvc2l0aW9uID0gdmVjNCh4eSwgMCwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIGAsXG4gICAgICAgIGZyYWc6IGBcbiAgICAgICAgICAgIHByZWNpc2lvbiBtZWRpdW1wIGZsb2F0O1xuICAgICAgICAgICAgdW5pZm9ybSBzYW1wbGVyMkQgdV9zcmM7XG4gICAgICAgICAgICB1bmlmb3JtIHNhbXBsZXIyRCBvbGRfdGV4dHVyZTtcbiAgICAgICAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIG5ld190ZXh0dXJlO1xuICAgICAgICAgICAgdW5pZm9ybSBzYW1wbGVyMkQgcmFuZG9tO1xuICAgICAgICAgICAgdmFyeWluZyB2ZWMyIHV2O1xuICAgICAgICAgICAgdm9pZCBtYWluICgpIHtcbiAgICAgICAgICAgICAgICB2ZWM0IG9sZHYgPSB0ZXh0dXJlMkQodV9zcmMsIHV2KTtcbiAgICAgICAgICAgICAgICBib29sIG9sZF90ZXh0ID0gb2xkdi55ID4gMC4yO1xuICAgICAgICAgICAgICAgIGJvb2wgbmV3X3NlZWQgPSB0ZXh0dXJlMkQobmV3X3RleHR1cmUsIHV2KS5nID4gMC4yO1xuICAgICAgICAgICAgICAgIGJvb2wgbmV3X2JvdW5kID0gdGV4dHVyZTJEKG5ld190ZXh0dXJlLCB1dikuciA+IDAuMjtcbiAgICAgICAgICAgICAgICBib29sIG9sZF9zZWVkID0gdGV4dHVyZTJEKG9sZF90ZXh0dXJlLCB1dikuZyA+IDAuMjtcbiAgICAgICAgICAgICAgICBib29sIG9sZF9ib3VuZCA9IHRleHR1cmUyRChvbGRfdGV4dHVyZSwgdXYpLnIgPiAwLjI7XG4gICAgICAgICAgICAgICAgdmVjNCByZXN1bHQgPSBvbGR2O1xuICAgICAgICAgICAgICAgIHZlYzQgcmFuZCA9IHRleHR1cmUyRChyYW5kb20sIHV2KTtcblxuICAgICAgICAgICAgICAgIC8qIENsZWFyIG1vcnBoMiB0byBhbGxvdyBtb3JwaDEgdG8gZ3Jvdy5cbiAgICAgICAgICAgICAgICAqL1xuXG4gICAgICAgICAgICAgICAgaWYgKG9sZF9ib3VuZCAmJiBuZXdfYm91bmQpIHtcblxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICghbmV3X2JvdW5kKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdC56dyA9IHZlYzIoMS4wLCAwLjApO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChuZXdfc2VlZCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAocmFuZC54ID4gMC44KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQueHkgPSB2ZWMyKDAuNSwgMC4yNSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQueHkgPSB2ZWMyKDEuMCwgMC4wKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChvbGRfdGV4dCkge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQueHkgPSB2ZWMyKDEuMCwgMC4wKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAobmV3X2JvdW5kKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChvbGRfYm91bmQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdC56dyA9IG9sZHYuenc7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAocmFuZC55ID4gMC45KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQuencgPSB2ZWMyKDAuNSwgMC4yNSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQuencgPSB2ZWMyKDEuMCwgMC4wKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBnbF9GcmFnQ29sb3IgPSByZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIGAsXG4gICAgICAgIGF0dHJpYnV0ZXM6IHt4eTogWy00LCAtNCwgMCwgNCwgNCwgLTRdfSxcbiAgICAgICAgdW5pZm9ybXM6IHtcbiAgICAgICAgICAgIHVfc3JjOiByZWdsLnByb3AoJ3NyYycpLFxuICAgICAgICAgICAgb2xkX3RleHR1cmU6IHJlZ2wucHJvcCgnb2xkX3RleHR1cmUnKSxcbiAgICAgICAgICAgIG5ld190ZXh0dXJlOiByZWdsLnByb3AoJ25ld190ZXh0dXJlJyksXG4gICAgICAgICAgICByYW5kb206IHJlZ2wucHJvcCgncmFuZG9tJylcbiAgICAgICAgICAgIC8vIHJlZ2wudGV4dHVyZSh7XG4gICAgICAgICAgICAvLyAgICAgd2lkdGg6IDUxMiwgaGVpZ2h0OiAyNTYsIGRhdGE6IHJhbmRvbV9saXN0KDUxMioyNTYqNClcbiAgICAgICAgICAgIC8vIH0pXG4gICAgICAgIH0sXG4gICAgICAgIGZyYW1lYnVmZmVyOiByZWdsLnByb3AoJ2RzdCcpLFxuICAgICAgICBkZXB0aDoge2VuYWJsZTogZmFsc2V9LFxuICAgICAgICBjb3VudDogMyxcbiAgICB9KTtcbn0iXX0=
