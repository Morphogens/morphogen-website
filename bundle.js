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
            varying vec2 vUv;
            void main () {
                vUv = xy * 0.5 + 0.5;
                gl_Position = vec4(xy, 0, 1);
            }
        `,
        frag: `
            precision mediump float;
            varying vec2 vUv;
            uniform vec4 rect;

            void main () {
                if (vUv.x < rect.x) discard;
                if (vUv.x > rect.z) discard;
                if (vUv.y > 1.0 - rect.y) discard;
                if (vUv.y < 1.0 - rect.w) discard;
                gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
                // if (vUv.y == 1.0 - rect.y) {
                //     // gl_FragColor = vec4(rand(vUv, 1.0), rand(vUv, 2.0)*0.25, rand(vUv, 2.0), rand(vUv, 3.0)*0.25);
                // } else {
                //     // gl_FragColor = vec4(rand(vUv, 1.0), rand(vUv, 2.0)*0.25, rand(vUv, 2.0), rand(vUv, 3.0)*0.25);
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
                uv.y = 1.0-uv.y;
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
                uv.y = 1.0 - uv.y;
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
                // if (!old_bound && new_bound || old_seed) {
                    if (rand.y > 0.9) {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJpbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9mYWlsLW5pY2VseS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9nbHNsaWZ5L2Jyb3dzZXIuanMiLCJub2RlX21vZHVsZXMvaC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9pbWFnZS1wcm9taXNlL2Rpc3QvaW1hZ2UtcHJvbWlzZS5jb21tb24tanMuanMiLCJub2RlX21vZHVsZXMvcmVnbC9kaXN0L3JlZ2wuanMiLCJzaGFkZXJzL2NsZWFyX3JlY3QuanMiLCJzaGFkZXJzL2NvbXB1dGUuanMiLCJzaGFkZXJzL2RyYXcuanMiLCJzaGFkZXJzL2luaXRpYWxpemUuanMiLCJzaGFkZXJzL3RyYW5zaXRpb24uanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1N1NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uKCl7ZnVuY3Rpb24gcihlLG4sdCl7ZnVuY3Rpb24gbyhpLGYpe2lmKCFuW2ldKXtpZighZVtpXSl7dmFyIGM9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZTtpZighZiYmYylyZXR1cm4gYyhpLCEwKTtpZih1KXJldHVybiB1KGksITApO3ZhciBhPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIraStcIidcIik7dGhyb3cgYS5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGF9dmFyIHA9bltpXT17ZXhwb3J0czp7fX07ZVtpXVswXS5jYWxsKHAuZXhwb3J0cyxmdW5jdGlvbihyKXt2YXIgbj1lW2ldWzFdW3JdO3JldHVybiBvKG58fHIpfSxwLHAuZXhwb3J0cyxyLGUsbix0KX1yZXR1cm4gbltpXS5leHBvcnRzfWZvcih2YXIgdT1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlLGk9MDtpPHQubGVuZ3RoO2krKylvKHRbaV0pO3JldHVybiBvfXJldHVybiByfSkoKSIsIi8vIHZhciBjcmVhdGVDb250cm9scyA9IHJlcXVpcmUoJy4vY29udHJvbHMnKTtcbi8vIGNvbnN0IG5vcm1hbGl6ZSA9IHJlcXVpcmUoJ2dsLXZlYzMvbm9ybWFsaXplJylcbmNvbnN0IGdsc2wgPSByZXF1aXJlKCdnbHNsaWZ5JylcbmNvbnN0IGxvYWRJbWFnZSA9IHJlcXVpcmUoJ2ltYWdlLXByb21pc2UnKVxuXG5cbmZ1bmN0aW9uIHJhbmRvbV9saXN0KHNpemUpIHtcbiAgICBjb25zdCByZXN1bHQgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNpemU7IGkrKykge1xuICAgICAgICByZXN1bHQucHVzaChNYXRoLmZsb29yKDI1NSpNYXRoLnJhbmRvbSgpKSlcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdFxufVxuZnVuY3Rpb24gaW50ZXJwb2xhdGUoYSwgYiwgdikge1xuICAgIHJldHVybiBbXG4gICAgICAgICgxLXYpKmFbMF0rIHYqYlswXSxcbiAgICAgICAgKDEtdikqYVsxXSsgdipiWzFdLFxuICAgICAgICAoMS12KSphWzJdKyB2KmJbMl0sXG4gICAgICAgICgxLXYpKmFbM10rIHYqYlszXVxuICAgIF1cbn1cblxucmVxdWlyZSgncmVnbCcpKHtcbiAgICBwaXhlbFJhdGlvOiAxLjAsXG4gICAgZXh0ZW5zaW9uczogW1xuICAgICAgICAnb2VzX3RleHR1cmVfZmxvYXQnLFxuICAgIF0sXG4gICAgb3B0aW9uYWxFeHRlbnNpb25zOiBbXG4gICAgICAgICdvZXNfdGV4dHVyZV9oYWxmX2Zsb2F0J1xuICAgIF0sXG4gICAgYXR0cmlidXRlczoge1xuICAgICAgICBhbnRpYWxpYXM6IGZhbHNlXG4gICAgfSxcbiAgICBvbkRvbmU6IHJlcXVpcmUoJ2ZhaWwtbmljZWx5JykobWFpbilcbn0pO1xuXG5mdW5jdGlvbiBtYWluKHJlZ2wpIHtcbiAgICBsZXQgdztcbiAgICBsZXQgaDtcbiAgICBsZXQgc2NhbGUgPSAxLjA7XG5cbiAgICBsZXQgc3RhdGVzID0gW11cblxuICAgIGxldCBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY29udGFpbmVyJylcbiAgICBsZXQgdGVzdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd0ZXN0JylcbiAgICBsZXQgY29udHJvbFJvb3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblxuICAgIGNvbnN0IGNsZWFyX3JlY3QgPSByZXF1aXJlKCcuL3NoYWRlcnMvY2xlYXJfcmVjdC5qcycpKHJlZ2wpXG4gICAgY29uc3QgaW5pdGlhbGl6ZSA9IHJlcXVpcmUoJy4vc2hhZGVycy9pbml0aWFsaXplLmpzJykocmVnbClcbiAgICBjb25zdCB0cmFuc2l0aW9uID0gcmVxdWlyZSgnLi9zaGFkZXJzL3RyYW5zaXRpb24uanMnKShyZWdsKVxuICAgIGNvbnN0IGNvbXB1dGUgPSByZXF1aXJlKCcuL3NoYWRlcnMvY29tcHV0ZS5qcycpKHJlZ2wpXG4gICAgY29uc3QgZHJhdyA9IHJlcXVpcmUoJy4vc2hhZGVycy9kcmF3LmpzJykocmVnbClcblxuICAgIGNvbnNvbGUudGltZSgnbG9hZF9pbWFnZXMnKVxuICAgIFByb21pc2UuYWxsKFtcbiAgICAgICAgUHJvbWlzZS5hbGwoW1xuICAgICAgICAgICAgbG9hZEltYWdlKCdpbWdzL3RpdGxlLnBuZycpLFxuICAgICAgICAgICAgbG9hZEltYWdlKCdpbWdzL2dlbl9kZXNpZ24ucG5nJylcbiAgICAgICAgXSksXG4gICAgICAgIFByb21pc2UuYWxsKFtcbiAgICAgICAgICAgIGxvYWRJbWFnZSgnaW1ncy90aXRsZV9tb2JpbGUucG5nJyksXG4gICAgICAgICAgICBsb2FkSW1hZ2UoJ2ltZ3MvZ2VuX2Rlc2lnbl9tb2JpbGUucG5nJylcbiAgICAgICAgXSksXG5cbiAgICBdKS50aGVuKChbIGltYWdlcywgbW9iaWxlX2ltYWdlcyBdKSA9PiB7XG4gICAgICAgIGNvbnNvbGUudGltZUVuZCgnbG9hZF9pbWFnZXMnKVxuXG4gICAgICAgIGNvbnN0IHBvcnRyYWl0X3RleHR1cmVzID0gbW9iaWxlX2ltYWdlcy5tYXAocmVnbC50ZXh0dXJlKVxuICAgICAgICBjb25zdCBsYW5kc2NhcGVfdGV4dHVyZXMgPSBpbWFnZXMubWFwKHJlZ2wudGV4dHVyZSlcbiAgICAgICAgbGV0IHRleHR1cmVzID0gbGFuZHNjYXBlX3RleHR1cmVzXG5cbiAgICAgICAgY29uc3QgcHVycGxlID0gWzEyOC8yNTUsIDY2LzI1NSwgMjQ0LzI1NSwgMS4wXVxuICAgICAgICBjb25zdCByZWQgPSBbMjE0LzI1NSwgNDQvMjU1LCA5OC8yNTUsIDEuMF1cblxuICAgICAgICBjb25zdCBzdGF0ZV9jb2xvcnMgPSBbXG4gICAgICAgICAgICBbWy45OCwgLjk4LCAuOTgsIDEuMF0sIHB1cnBsZV0sXG4gICAgICAgICAgICBbWzAsIDAuMCwgLjksIDEuMF0sIFsuOTIsIC45MiwgLjkyLCAxLjBdXSxcbiAgICAgICAgICAgIC8vIFtwdXJwbGUsIHB1cnBsZV0sXG4gICAgICAgICAgICBbcmVkLCByZWRdXG4gICAgICAgIF1cblxuXG4gICAgICAgIC8vIGNvbnNvbGUubG9nKCdvbmxvYWQnKVxuXG4gICAgICAgIGxldCBjb2xvckEgPSBzdGF0ZV9jb2xvcnNbMF1bMF1cbiAgICAgICAgbGV0IGNvbG9yQiA9IHN0YXRlX2NvbG9yc1swXVsxXVxuXG4gICAgICAgIGxldCByZWN0ID0gbmV3IEZsb2F0MzJBcnJheSg0KTtcbiAgICAgICAgbGV0IHJlY3RCdWYgPSByZWdsLmJ1ZmZlcihyZWN0KTtcblxuICAgICAgICBmdW5jdGlvbiBzY3JvbGxfaW5kZXgoKSB7XG4gICAgICAgICAgICBjb25zdCBzdGVwID0gY29udGFpbmVyLnNjcm9sbEhlaWdodCAvIGltYWdlcy5sZW5ndGhcbiAgICAgICAgICAgIGNvbnN0IHkgPSBjb250YWluZXIuc2Nyb2xsVG9wXG4gICAgICAgICAgICBjb25zdCBpZHggPSBNYXRoLm1pbihNYXRoLmZsb29yKHkgLyBzdGVwKSwgaW1hZ2VzLmxlbmd0aCAtMSlcbiAgICAgICAgICAgIGNvbnN0IHBlcmNlbnQgPSAoeSAtIGlkeCpzdGVwKSAvIHN0ZXBcbiAgICAgICAgICAgIHJldHVybiBbIGlkeCwgcGVyY2VudCBdXG4gICAgICAgIH1cblxuICAgICAgICBsZXQgWyBzY3JvbGxfaWR4LCBzY3JvbGxfcGVyY2VudCBdID0gc2Nyb2xsX2luZGV4KClcbiAgICAgICAgbGV0IGxhc3Rfc2Nyb2xsX2lkeCA9IHNjcm9sbF9pZHhcblxuXG4gICAgICAgIGZ1bmN0aW9uIHJlc3RhcnQoKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygncmVzdGFydCcpXG4gICAgICAgICAgICB3ID0gTWF0aC5mbG9vcihyZWdsLl9nbC5jYW52YXMud2lkdGggKiBzY2FsZSk7XG4gICAgICAgICAgICBoID0gTWF0aC5mbG9vcihyZWdsLl9nbC5jYW52YXMuaGVpZ2h0ICogc2NhbGUpO1xuICAgICAgICAgICAgY29uc29sZS5sb2codywgaClcbiAgICAgICAgICAgIHRleHR1cmVzID0gdyA+IDEyMDAgPyBsYW5kc2NhcGVfdGV4dHVyZXMgOiBwb3J0cmFpdF90ZXh0dXJlc1xuXG4gICAgICAgICAgICBzdGF0ZXMgPSBbMCwgMV0ubWFwKGkgPT4gKHN0YXRlc1tpXSB8fCByZWdsLmZyYW1lYnVmZmVyKSh7XG4gICAgICAgICAgICAgICAgY29sb3JUeXBlOiByZWdsLmhhc0V4dGVuc2lvbignb2VzX3RleHR1cmVfaGFsZl9mbG9hdCcpID8gJ2hhbGYgZmxvYXQnIDogJ2Zsb2F0JyxcbiAgICAgICAgICAgICAgICB3aWR0aDogdyxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGgsXG4gICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICBjb25zdCByYW5kb20gPSByZWdsLnRleHR1cmUoe1xuICAgICAgICAgICAgICB3aWR0aDogNTEyLFxuICAgICAgICAgICAgICBoZWlnaHQ6IDI1NixcbiAgICAgICAgICAgICAgZGF0YTogcmFuZG9tX2xpc3QoNTEyKjI1Nio0KVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIGluaXRpYWxpemUoeyBkc3Q6IHN0YXRlc1swXSwgdGV4dHVyZTogdGV4dHVyZXNbMF0sIHJhbmRvbX0pO1xuICAgICAgICAgICAgdXBkYXRlX3Njcm9sbCgpXG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiB1cGRhdGVfc2Nyb2xsKCkge1xuICAgICAgICAgICAgW3Njcm9sbF9pZHgsIHNjcm9sbF9wZXJjZW50XSA9IHNjcm9sbF9pbmRleCgpXG4gICAgICAgICAgICBpZiAoc2Nyb2xsX2lkeCAhPSBsYXN0X3Njcm9sbF9pZHgpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygndHJhbnNpdGlvbicsIGxhc3Rfc2Nyb2xsX2lkeCwgc2Nyb2xsX2lkeClcbiAgICAgICAgICAgICAgICB0cmFuc2l0aW9uKHtcbiAgICAgICAgICAgICAgICAgICAgc3JjOiBzdGF0ZXNbMV0sXG4gICAgICAgICAgICAgICAgICAgIGRzdDogc3RhdGVzWzBdLFxuICAgICAgICAgICAgICAgICAgICBvbGRfdGV4dHVyZTogdGV4dHVyZXNbbGFzdF9zY3JvbGxfaWR4XSxcbiAgICAgICAgICAgICAgICAgICAgbmV3X3RleHR1cmU6IHRleHR1cmVzW3Njcm9sbF9pZHhdLFxuICAgICAgICAgICAgICAgICAgICByYW5kb206IHJlZ2wudGV4dHVyZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICB3aWR0aDogNTEyLCBoZWlnaHQ6IDI1NiwgZGF0YTogcmFuZG9tX2xpc3QoNTEyKjI1Nio0KVxuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgbGFzdF9zY3JvbGxfaWR4ID0gc2Nyb2xsX2lkeFxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBsZXQgcCA9IChzY3JvbGxfcGVyY2VudClcbiAgICAgICAgICAgIGxldCBmb29cbiAgICAgICAgICAgIGlmIChwIDwgMC4yNSkge1xuICAgICAgICAgICAgICAgIGZvbyA9IDBcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocCA+IDAuNzUpIHtcbiAgICAgICAgICAgICAgICBmb28gPSAxLjBcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZm9vID0gKHAtMC4yNSkgKiAyLjBcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbG9yQSA9IGludGVycG9sYXRlKHN0YXRlX2NvbG9yc1tzY3JvbGxfaWR4XVswXSwgc3RhdGVfY29sb3JzW3Njcm9sbF9pZHgrMV1bMF0sIGZvbylcbiAgICAgICAgICAgIGNvbG9yQiA9IGludGVycG9sYXRlKHN0YXRlX2NvbG9yc1tzY3JvbGxfaWR4XVsxXSwgc3RhdGVfY29sb3JzW3Njcm9sbF9pZHgrMV1bMV0sIGZvbylcbiAgICAgICAgICAgIC8vIGNvbnNvbGUubG9nKHNjcm9sbF9wZXJjZW50LCBjb2xvckEpXG4gICAgICAgIH1cblxuICAgICAgICBjb250YWluZXIuYWRkRXZlbnRMaXN0ZW5lcignc2Nyb2xsJywgKGV2ZW50KSA9PiB7XG4gICAgICAgICAgICB1cGRhdGVfc2Nyb2xsKClcbiAgICAgICAgfSlcblxuICAgICAgICByZXN0YXJ0KClcblxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgcmVzdGFydClcbiAgICAgICAgbGV0IGl0ZXJzUGVyRnJhbWUgPSAyXG4gICAgICAgIGxldCBwcmV2VGltZSA9IG51bGxcbiAgICAgICAgbGV0IHNsb3dDb3VudCA9IDBcbiAgICAgICAgcmVnbC5mcmFtZSgoe3RpY2ssIHRpbWV9KSA9PiB7XG4gICAgICAgICAgICBpZiAocHJldlRpbWUpIHtcbiAgICAgICAgICAgICAgICB2YXIgZHQgPSB0aW1lIC0gcHJldlRpbWU7XG4gICAgICAgICAgICAgICAgaWYgKGR0ID4gMS40IC8gNjApIHtcbiAgICAgICAgICAgICAgICAgICAgc2xvd0NvdW50Kys7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChkdCA8IDEuMSAvIDYwKSB7XG4gICAgICAgICAgICAgICAgICAgIHNsb3dDb3VudC0tO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoc2xvd0NvdW50ID4gMTApIHtcbiAgICAgICAgICAgICAgICAgICAgc2xvd0NvdW50ID0gMDtcbiAgICAgICAgICAgICAgICAgICAgaXRlcnNQZXJGcmFtZSA9IE1hdGgubWF4KDEsIGl0ZXJzUGVyRnJhbWUgLSAxKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHNsb3dDb3VudCA8IC0xMCkge1xuICAgICAgICAgICAgICAgICAgICBzbG93Q291bnQgPSAwO1xuICAgICAgICAgICAgICAgICAgICBpdGVyc1BlckZyYW1lID0gTWF0aC5taW4oMTAsIGl0ZXJzUGVyRnJhbWUgKyAxKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBwcmV2VGltZSA9IHRpbWU7XG5cbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaXRlcnNQZXJGcmFtZTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY29tcHV0ZSh7c3JjOiBzdGF0ZXNbMF0sIGRzdDogc3RhdGVzWzFdfSk7XG4gICAgICAgICAgICAgICAgY29tcHV0ZSh7c3JjOiBzdGF0ZXNbMV0sIGRzdDogc3RhdGVzWzBdfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBib3VuZHMgPSB0ZXN0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpXG4gICAgICAgICAgICBjbGVhcl9yZWN0KHtcbiAgICAgICAgICAgICAgICBkc3Q6IHN0YXRlc1swXSxcbiAgICAgICAgICAgICAgICByZWN0OiBbXG4gICAgICAgICAgICAgICAgICAgIGJvdW5kcy5sZWZ0IC8gd2luZG93LmlubmVyV2lkdGgsXG4gICAgICAgICAgICAgICAgICAgIGJvdW5kcy50b3AgLyB3aW5kb3cuaW5uZXJIZWlnaHQsXG4gICAgICAgICAgICAgICAgICAgIGJvdW5kcy5yaWdodCAvIHdpbmRvdy5pbm5lcldpZHRoLFxuICAgICAgICAgICAgICAgICAgICBib3VuZHMuYm90dG9tIC8gd2luZG93LmlubmVySGVpZ2h0XG4gICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBkcmF3KHsgY29sb3JBLCBjb2xvckIsIHNyYzogc3RhdGVzWzBdIH0pO1xuICAgICAgICB9KVxuICAgIH0pXG59IiwiJ3VzZSBzdHJpY3QnXG5cbnZhciBoID0gcmVxdWlyZSgnaCcpXG5cbm1vZHVsZS5leHBvcnRzID0gZmFpbE5pY2VseVxuXG5mdW5jdGlvbiBmYWlsTmljZWx5IChjYWxsYmFjaywgb3B0aW9ucykge1xuICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fVxuXG4gIHJldHVybiBmdW5jdGlvbiAoZXJyLCBkYXRhKSB7XG4gICAgaWYgKCFlcnIpIHtcbiAgICAgIHJldHVybiBjYWxsYmFjayAmJiBjYWxsYmFjayhkYXRhKVxuICAgIH1cblxuICAgIGlmIChlcnIgaW5zdGFuY2VvZiBFcnJvcikge1xuICAgICAgZXJyID0gZXJyLm5hbWUgKyAnOiAnICsgZXJyLm1lc3NhZ2VcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBlcnIgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2ZhaWwtbmljZWx5OiBPb3BzISB0aGUgbWVzc2FnZSBtdXN0IGJlIGEgU3RyaW5nIG9yIGFuIEVycm9yLiBIb3cgaXJvbmljLicpXG4gICAgfVxuXG4gICAgdmFyIHpJbmRleCA9IG9wdGlvbnMuekluZGV4ID09PSB1bmRlZmluZWQgPyA5OTk5IDogcGFyc2VJbnQob3B0aW9ucy56SW5kZXgpXG4gICAgdmFyIGJnID0gb3B0aW9ucy5iZyA9PT0gdW5kZWZpbmVkID8gJyMzMzMnIDogb3B0aW9ucy5iZ1xuICAgIHZhciBmZyA9IG9wdGlvbnMuZmcgPT09IHVuZGVmaW5lZCA/ICcjZmZmJyA6IG9wdGlvbnMuZmdcbiAgICB2YXIgdGl0bGUgPSBvcHRpb25zLnRpdGxlID09PSB1bmRlZmluZWQgPyAnU29ycnkhJyA6IG9wdGlvbnMudGl0bGVcbiAgICB2YXIgZm9udEZhbWlseSA9IG9wdGlvbnMuZm9udEZhbWlseSA9PT0gdW5kZWZpbmVkID8gJ0hlbHZldGljYSwgQXJpYWwsIHNhbnMtc2VyaWYnIDogb3B0aW9ucy5mb250RmFtaWx5XG4gICAgdmFyIHBvc2l0aW9uID0gb3B0aW9ucy5wb3NpdGlvbiA9PT0gdW5kZWZpbmVkID8gJ2ZpeGVkJyA6IG9wdGlvbnMucG9zaXRpb25cbiAgICB2YXIgaW52ZXJ0ID0gb3B0aW9ucy5pbnZlcnQgPT09IHVuZGVmaW5lZCA/IGZhbHNlIDogISFvcHRpb25zLmludmVydFxuXG4gICAgaWYgKGludmVydCkge1xuICAgICAgdmFyIHRtcCA9IGZnXG4gICAgICBmZyA9IGJnXG4gICAgICBiZyA9IHRtcFxuICAgIH1cblxuICAgIHZhciBvdmVybGF5U3R5bGVzID0ge1xuICAgICAgcG9zaXRpb246IHBvc2l0aW9uLFxuICAgICAgdG9wOiAwLFxuICAgICAgcmlnaHQ6IDAsXG4gICAgICBib3R0b206IDAsXG4gICAgICBsZWZ0OiAwLFxuICAgICAgJ2JhY2tncm91bmQtY29sb3InOiBiZyxcbiAgICAgIGNvbG9yOiBmZyxcbiAgICAgICd0ZXh0LWFsaWduJzogJ2NlbnRlcicsXG4gICAgICAnei1pbmRleCc6IHpJbmRleFxuICAgIH1cblxuICAgIHZhciBoZWFkaW5nU3R5bGVzID0ge1xuICAgICAgJ2ZvbnQtZmFtaWx5JzogZm9udEZhbWlseVxuICAgIH1cblxuICAgIHZhciBleHBsYW5hdGlvblN0eWxlcyA9IHtcbiAgICAgICdmb250LWZhbWlseSc6IGZvbnRGYW1pbHksXG4gICAgICAnbWF4LXdpZHRoJzogJzY0MHB4JyxcbiAgICAgICdtYXJnaW4tbGVmdCc6ICdhdXRvJyxcbiAgICAgICdtYXJnaW4tcmlnaHQnOiAnYXV0bycsXG4gICAgICAnbGluZS1oZWlnaHQnOiAnMS40JyxcbiAgICAgICdwYWRkaW5nJzogJzAgMTVweCdcbiAgICB9XG5cbiAgICB2YXIgY29udGFpbmVyU3R5bGVzID0ge1xuICAgICAgJ3RyYW5zZm9ybSc6ICd0cmFuc2xhdGUoMCwgLTUwJSknLFxuICAgICAgJ21hcmdpbi10b3AnOiAnNTB2aCdcbiAgICB9XG5cbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGgoJ2RpdicsIHtzdHlsZTogb3ZlcmxheVN0eWxlc30sIFtcbiAgICAgIGgoJ2RpdicsIHtzdHlsZTogY29udGFpbmVyU3R5bGVzfSwgW1xuICAgICAgICBoKCdoMScsIHRpdGxlLCB7c3R5bGU6IGhlYWRpbmdTdHlsZXN9KSxcbiAgICAgICAgaCgncCcsIGVyciwge3N0eWxlOiBleHBsYW5hdGlvblN0eWxlc30pXG4gICAgICBdKVxuICAgIF0pKVxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHN0cmluZ3MpIHtcclxuICBpZiAodHlwZW9mIHN0cmluZ3MgPT09ICdzdHJpbmcnKSBzdHJpbmdzID0gW3N0cmluZ3NdXHJcbiAgdmFyIGV4cHJzID0gW10uc2xpY2UuY2FsbChhcmd1bWVudHMsMSlcclxuICB2YXIgcGFydHMgPSBbXVxyXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyaW5ncy5sZW5ndGgtMTsgaSsrKSB7XHJcbiAgICBwYXJ0cy5wdXNoKHN0cmluZ3NbaV0sIGV4cHJzW2ldIHx8ICcnKVxyXG4gIH1cclxuICBwYXJ0cy5wdXNoKHN0cmluZ3NbaV0pXHJcbiAgcmV0dXJuIHBhcnRzLmpvaW4oJycpXHJcbn1cclxuIiwiOyhmdW5jdGlvbiAoKSB7XG5cbmZ1bmN0aW9uIGgoKSB7XG4gIHZhciBhcmdzID0gW10uc2xpY2UuY2FsbChhcmd1bWVudHMpLCBlID0gbnVsbFxuICBmdW5jdGlvbiBpdGVtIChsKSB7XG4gICAgXG4gICAgZnVuY3Rpb24gcGFyc2VDbGFzcyAoc3RyaW5nKSB7XG4gICAgICB2YXIgbSA9IHN0cmluZy5zcGxpdCgvKFtcXC4jXT9bYS16QS1aMC05Xy1dKykvKVxuICAgICAgbS5mb3JFYWNoKGZ1bmN0aW9uICh2KSB7XG4gICAgICAgIHZhciBzID0gdi5zdWJzdHJpbmcoMSx2Lmxlbmd0aClcbiAgICAgICAgaWYoIXYpIHJldHVybiBcbiAgICAgICAgaWYoIWUpXG4gICAgICAgICAgZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQodilcbiAgICAgICAgZWxzZSBpZiAodlswXSA9PT0gJy4nKVxuICAgICAgICAgIGUuY2xhc3NMaXN0LmFkZChzKVxuICAgICAgICBlbHNlIGlmICh2WzBdID09PSAnIycpXG4gICAgICAgICAgZS5zZXRBdHRyaWJ1dGUoJ2lkJywgcylcbiAgICAgICAgXG4gICAgICB9KVxuICAgIH1cblxuICAgIGlmKGwgPT0gbnVsbClcbiAgICAgIDtcbiAgICBlbHNlIGlmKCdzdHJpbmcnID09PSB0eXBlb2YgbCkge1xuICAgICAgaWYoIWUpXG4gICAgICAgIHBhcnNlQ2xhc3MobClcbiAgICAgIGVsc2VcbiAgICAgICAgZS5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShsKSlcbiAgICB9XG4gICAgZWxzZSBpZignbnVtYmVyJyA9PT0gdHlwZW9mIGwgXG4gICAgICB8fCAnYm9vbGVhbicgPT09IHR5cGVvZiBsXG4gICAgICB8fCBsIGluc3RhbmNlb2YgRGF0ZSBcbiAgICAgIHx8IGwgaW5zdGFuY2VvZiBSZWdFeHAgKSB7XG4gICAgICAgIGUuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUobC50b1N0cmluZygpKSlcbiAgICB9XG4gICAgZWxzZSBpZiAoQXJyYXkuaXNBcnJheShsKSlcbiAgICAgIGwuZm9yRWFjaChpdGVtKVxuICAgIGVsc2UgaWYobCBpbnN0YW5jZW9mIEhUTUxFbGVtZW50KVxuICAgICAgZS5hcHBlbmRDaGlsZChsKVxuICAgIGVsc2UgaWYgKCdvYmplY3QnID09PSB0eXBlb2YgbCkge1xuICAgICAgZm9yICh2YXIgayBpbiBsKSB7XG4gICAgICAgIGlmKCdmdW5jdGlvbicgPT09IHR5cGVvZiBsW2tdKVxuICAgICAgICAgIGUuYWRkRXZlbnRMaXN0ZW5lcihrLCBsW2tdKVxuICAgICAgICBlbHNlIGlmKGsgPT09ICdzdHlsZScpIHtcbiAgICAgICAgICBmb3IgKHZhciBzIGluIGxba10pXG4gICAgICAgICAgICBlLnN0eWxlLnNldFByb3BlcnR5KHMsIGxba11bc10pXG4gICAgICAgIH1cbiAgICAgICAgZWxzZVxuICAgICAgICAgIGUuc2V0QXR0cmlidXRlKGssIGxba10pXG4gICAgICB9XG4gICAgfVxuICB9XG4gIHdoaWxlKGFyZ3MubGVuZ3RoKSB7XG4gICAgaXRlbShhcmdzLnNoaWZ0KCkpXG4gIH1cbiAgcmV0dXJuIGVcbn1cblxuaWYodHlwZW9mIG1vZHVsZSA9PT0gJ29iamVjdCcpXG4gIG1vZHVsZS5leHBvcnRzID0gaFxuZWxzZVxuICB0aGlzLmggPSBoXG59KSgpXG4iLCIvKiEgbnBtLmltL2ltYWdlLXByb21pc2UgNi4wLjAgKi9cbid1c2Ugc3RyaWN0JztcblxuZnVuY3Rpb24gbG9hZChpbWFnZSwgYXR0cmlidXRlcykge1xuXHRpZiAoIWltYWdlKSB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KCk7XG5cdH0gZWxzZSBpZiAodHlwZW9mIGltYWdlID09PSAnc3RyaW5nJykge1xuXHRcdC8qIENyZWF0ZSBhIDxpbWc+IGZyb20gYSBzdHJpbmcgKi9cblx0XHR2YXIgc3JjID0gaW1hZ2U7XG5cdFx0aW1hZ2UgPSBuZXcgSW1hZ2UoKTtcblx0XHRPYmplY3Qua2V5cyhhdHRyaWJ1dGVzIHx8IHt9KS5mb3JFYWNoKFxuXHRcdFx0ZnVuY3Rpb24gKG5hbWUpIHsgcmV0dXJuIGltYWdlLnNldEF0dHJpYnV0ZShuYW1lLCBhdHRyaWJ1dGVzW25hbWVdKTsgfVxuXHRcdCk7XG5cdFx0aW1hZ2Uuc3JjID0gc3JjO1xuXHR9IGVsc2UgaWYgKGltYWdlLmxlbmd0aCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0LyogVHJlYXQgYXMgbXVsdGlwbGUgaW1hZ2VzICovXG5cblx0XHQvLyBNb21lbnRhcmlseSBpZ25vcmUgZXJyb3JzXG5cdFx0dmFyIHJlZmxlY3RlZCA9IFtdLm1hcC5jYWxsKGltYWdlLCBmdW5jdGlvbiAoaW1nKSB7IHJldHVybiBsb2FkKGltZywgYXR0cmlidXRlcykuY2F0Y2goZnVuY3Rpb24gKGVycikgeyByZXR1cm4gZXJyOyB9KTsgfSk7XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5hbGwocmVmbGVjdGVkKS50aGVuKGZ1bmN0aW9uIChyZXN1bHRzKSB7XG5cdFx0XHR2YXIgbG9hZGVkID0gcmVzdWx0cy5maWx0ZXIoZnVuY3Rpb24gKHgpIHsgcmV0dXJuIHgubmF0dXJhbFdpZHRoOyB9KTtcblx0XHRcdGlmIChsb2FkZWQubGVuZ3RoID09PSByZXN1bHRzLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gbG9hZGVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KHtcblx0XHRcdFx0bG9hZGVkOiBsb2FkZWQsXG5cdFx0XHRcdGVycm9yZWQ6IHJlc3VsdHMuZmlsdGVyKGZ1bmN0aW9uICh4KSB7IHJldHVybiAheC5uYXR1cmFsV2lkdGg7IH0pXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSBlbHNlIGlmIChpbWFnZS50YWdOYW1lICE9PSAnSU1HJykge1xuXHRcdHJldHVybiBQcm9taXNlLnJlamVjdCgpO1xuXHR9XG5cblx0dmFyIHByb21pc2UgPSBuZXcgUHJvbWlzZShmdW5jdGlvbiAocmVzb2x2ZSwgcmVqZWN0KSB7XG5cdFx0aWYgKGltYWdlLm5hdHVyYWxXaWR0aCkge1xuXHRcdFx0Ly8gSWYgdGhlIGJyb3dzZXIgY2FuIGRldGVybWluZSB0aGUgbmF0dXJhbFdpZHRoIHRoZVxuXHRcdFx0Ly8gaW1hZ2UgaXMgYWxyZWFkeSBsb2FkZWQgc3VjY2Vzc2Z1bGx5XG5cdFx0XHRyZXNvbHZlKGltYWdlKTtcblx0XHR9IGVsc2UgaWYgKGltYWdlLmNvbXBsZXRlKSB7XG5cdFx0XHQvLyBJZiB0aGUgaW1hZ2UgaXMgY29tcGxldGUgYnV0IHRoZSBuYXR1cmFsV2lkdGggaXMgMHB4XG5cdFx0XHQvLyBpdCBpcyBwcm9iYWJseSBicm9rZW5cblx0XHRcdHJlamVjdChpbWFnZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGltYWdlLmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWQnLCBmdWxsZmlsbCk7XG5cdFx0XHRpbWFnZS5hZGRFdmVudExpc3RlbmVyKCdlcnJvcicsIGZ1bGxmaWxsKTtcblx0XHR9XG5cdFx0ZnVuY3Rpb24gZnVsbGZpbGwoKSB7XG5cdFx0XHRpZiAoaW1hZ2UubmF0dXJhbFdpZHRoKSB7XG5cdFx0XHRcdHJlc29sdmUoaW1hZ2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVqZWN0KGltYWdlKTtcblx0XHRcdH1cblx0XHRcdGltYWdlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2xvYWQnLCBmdWxsZmlsbCk7XG5cdFx0XHRpbWFnZS5yZW1vdmVFdmVudExpc3RlbmVyKCdlcnJvcicsIGZ1bGxmaWxsKTtcblx0XHR9XG5cdH0pO1xuXHRwcm9taXNlLmltYWdlID0gaW1hZ2U7XG5cdHJldHVybiBwcm9taXNlO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGxvYWQ7XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCwgZmFjdG9yeSkge1xuXHR0eXBlb2YgZXhwb3J0cyA9PT0gJ29iamVjdCcgJiYgdHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgPyBtb2R1bGUuZXhwb3J0cyA9IGZhY3RvcnkoKSA6XG5cdHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCA/IGRlZmluZShmYWN0b3J5KSA6XG5cdChnbG9iYWwuY3JlYXRlUkVHTCA9IGZhY3RvcnkoKSk7XG59KHRoaXMsIChmdW5jdGlvbiAoKSB7ICd1c2Ugc3RyaWN0JztcblxudmFyIGlzVHlwZWRBcnJheSA9IGZ1bmN0aW9uICh4KSB7XHJcbiAgcmV0dXJuIChcclxuICAgIHggaW5zdGFuY2VvZiBVaW50OEFycmF5IHx8XHJcbiAgICB4IGluc3RhbmNlb2YgVWludDE2QXJyYXkgfHxcclxuICAgIHggaW5zdGFuY2VvZiBVaW50MzJBcnJheSB8fFxyXG4gICAgeCBpbnN0YW5jZW9mIEludDhBcnJheSB8fFxyXG4gICAgeCBpbnN0YW5jZW9mIEludDE2QXJyYXkgfHxcclxuICAgIHggaW5zdGFuY2VvZiBJbnQzMkFycmF5IHx8XHJcbiAgICB4IGluc3RhbmNlb2YgRmxvYXQzMkFycmF5IHx8XHJcbiAgICB4IGluc3RhbmNlb2YgRmxvYXQ2NEFycmF5IHx8XHJcbiAgICB4IGluc3RhbmNlb2YgVWludDhDbGFtcGVkQXJyYXlcclxuICApXHJcbn07XG5cbnZhciBleHRlbmQgPSBmdW5jdGlvbiAoYmFzZSwgb3B0cykge1xyXG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXMob3B0cyk7XHJcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBrZXlzLmxlbmd0aDsgKytpKSB7XHJcbiAgICBiYXNlW2tleXNbaV1dID0gb3B0c1trZXlzW2ldXTtcclxuICB9XHJcbiAgcmV0dXJuIGJhc2VcclxufTtcblxuLy8gRXJyb3IgY2hlY2tpbmcgYW5kIHBhcmFtZXRlciB2YWxpZGF0aW9uLlxyXG4vL1xyXG4vLyBTdGF0ZW1lbnRzIGZvciB0aGUgZm9ybSBgY2hlY2suc29tZVByb2NlZHVyZSguLi4pYCBnZXQgcmVtb3ZlZCBieVxyXG4vLyBhIGJyb3dzZXJpZnkgdHJhbnNmb3JtIGZvciBvcHRpbWl6ZWQvbWluaWZpZWQgYnVuZGxlcy5cclxuLy9cclxuLyogZ2xvYmFscyBhdG9iICovXHJcbnZhciBlbmRsID0gJ1xcbic7XHJcblxyXG4vLyBvbmx5IHVzZWQgZm9yIGV4dHJhY3Rpbmcgc2hhZGVyIG5hbWVzLiAgaWYgYXRvYiBub3QgcHJlc2VudCwgdGhlbiBlcnJvcnNcclxuLy8gd2lsbCBiZSBzbGlnaHRseSBjcmFwcGllclxyXG5mdW5jdGlvbiBkZWNvZGVCNjQgKHN0cikge1xyXG4gIGlmICh0eXBlb2YgYXRvYiAhPT0gJ3VuZGVmaW5lZCcpIHtcclxuICAgIHJldHVybiBhdG9iKHN0cilcclxuICB9XHJcbiAgcmV0dXJuICdiYXNlNjQ6JyArIHN0clxyXG59XHJcblxyXG5mdW5jdGlvbiByYWlzZSAobWVzc2FnZSkge1xyXG4gIHZhciBlcnJvciA9IG5ldyBFcnJvcignKHJlZ2wpICcgKyBtZXNzYWdlKTtcclxuICBjb25zb2xlLmVycm9yKGVycm9yKTtcclxuICB0aHJvdyBlcnJvclxyXG59XHJcblxyXG5mdW5jdGlvbiBjaGVjayAocHJlZCwgbWVzc2FnZSkge1xyXG4gIGlmICghcHJlZCkge1xyXG4gICAgcmFpc2UobWVzc2FnZSk7XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBlbmNvbG9uIChtZXNzYWdlKSB7XHJcbiAgaWYgKG1lc3NhZ2UpIHtcclxuICAgIHJldHVybiAnOiAnICsgbWVzc2FnZVxyXG4gIH1cclxuICByZXR1cm4gJydcclxufVxyXG5cclxuZnVuY3Rpb24gY2hlY2tQYXJhbWV0ZXIgKHBhcmFtLCBwb3NzaWJpbGl0aWVzLCBtZXNzYWdlKSB7XHJcbiAgaWYgKCEocGFyYW0gaW4gcG9zc2liaWxpdGllcykpIHtcclxuICAgIHJhaXNlKCd1bmtub3duIHBhcmFtZXRlciAoJyArIHBhcmFtICsgJyknICsgZW5jb2xvbihtZXNzYWdlKSArXHJcbiAgICAgICAgICAnLiBwb3NzaWJsZSB2YWx1ZXM6ICcgKyBPYmplY3Qua2V5cyhwb3NzaWJpbGl0aWVzKS5qb2luKCkpO1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gY2hlY2tJc1R5cGVkQXJyYXkgKGRhdGEsIG1lc3NhZ2UpIHtcclxuICBpZiAoIWlzVHlwZWRBcnJheShkYXRhKSkge1xyXG4gICAgcmFpc2UoXHJcbiAgICAgICdpbnZhbGlkIHBhcmFtZXRlciB0eXBlJyArIGVuY29sb24obWVzc2FnZSkgK1xyXG4gICAgICAnLiBtdXN0IGJlIGEgdHlwZWQgYXJyYXknKTtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNoZWNrVHlwZU9mICh2YWx1ZSwgdHlwZSwgbWVzc2FnZSkge1xyXG4gIGlmICh0eXBlb2YgdmFsdWUgIT09IHR5cGUpIHtcclxuICAgIHJhaXNlKFxyXG4gICAgICAnaW52YWxpZCBwYXJhbWV0ZXIgdHlwZScgKyBlbmNvbG9uKG1lc3NhZ2UpICtcclxuICAgICAgJy4gZXhwZWN0ZWQgJyArIHR5cGUgKyAnLCBnb3QgJyArICh0eXBlb2YgdmFsdWUpKTtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNoZWNrTm9uTmVnYXRpdmVJbnQgKHZhbHVlLCBtZXNzYWdlKSB7XHJcbiAgaWYgKCEoKHZhbHVlID49IDApICYmXHJcbiAgICAgICAgKCh2YWx1ZSB8IDApID09PSB2YWx1ZSkpKSB7XHJcbiAgICByYWlzZSgnaW52YWxpZCBwYXJhbWV0ZXIgdHlwZSwgKCcgKyB2YWx1ZSArICcpJyArIGVuY29sb24obWVzc2FnZSkgK1xyXG4gICAgICAgICAgJy4gbXVzdCBiZSBhIG5vbm5lZ2F0aXZlIGludGVnZXInKTtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNoZWNrT25lT2YgKHZhbHVlLCBsaXN0LCBtZXNzYWdlKSB7XHJcbiAgaWYgKGxpc3QuaW5kZXhPZih2YWx1ZSkgPCAwKSB7XHJcbiAgICByYWlzZSgnaW52YWxpZCB2YWx1ZScgKyBlbmNvbG9uKG1lc3NhZ2UpICsgJy4gbXVzdCBiZSBvbmUgb2Y6ICcgKyBsaXN0KTtcclxuICB9XHJcbn1cclxuXHJcbnZhciBjb25zdHJ1Y3RvcktleXMgPSBbXHJcbiAgJ2dsJyxcclxuICAnY2FudmFzJyxcclxuICAnY29udGFpbmVyJyxcclxuICAnYXR0cmlidXRlcycsXHJcbiAgJ3BpeGVsUmF0aW8nLFxyXG4gICdleHRlbnNpb25zJyxcclxuICAnb3B0aW9uYWxFeHRlbnNpb25zJyxcclxuICAncHJvZmlsZScsXHJcbiAgJ29uRG9uZSdcclxuXTtcclxuXHJcbmZ1bmN0aW9uIGNoZWNrQ29uc3RydWN0b3IgKG9iaikge1xyXG4gIE9iamVjdC5rZXlzKG9iaikuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XHJcbiAgICBpZiAoY29uc3RydWN0b3JLZXlzLmluZGV4T2Yoa2V5KSA8IDApIHtcclxuICAgICAgcmFpc2UoJ2ludmFsaWQgcmVnbCBjb25zdHJ1Y3RvciBhcmd1bWVudCBcIicgKyBrZXkgKyAnXCIuIG11c3QgYmUgb25lIG9mICcgKyBjb25zdHJ1Y3RvcktleXMpO1xyXG4gICAgfVxyXG4gIH0pO1xyXG59XHJcblxyXG5mdW5jdGlvbiBsZWZ0UGFkIChzdHIsIG4pIHtcclxuICBzdHIgPSBzdHIgKyAnJztcclxuICB3aGlsZSAoc3RyLmxlbmd0aCA8IG4pIHtcclxuICAgIHN0ciA9ICcgJyArIHN0cjtcclxuICB9XHJcbiAgcmV0dXJuIHN0clxyXG59XHJcblxyXG5mdW5jdGlvbiBTaGFkZXJGaWxlICgpIHtcclxuICB0aGlzLm5hbWUgPSAndW5rbm93bic7XHJcbiAgdGhpcy5saW5lcyA9IFtdO1xyXG4gIHRoaXMuaW5kZXggPSB7fTtcclxuICB0aGlzLmhhc0Vycm9ycyA9IGZhbHNlO1xyXG59XHJcblxyXG5mdW5jdGlvbiBTaGFkZXJMaW5lIChudW1iZXIsIGxpbmUpIHtcclxuICB0aGlzLm51bWJlciA9IG51bWJlcjtcclxuICB0aGlzLmxpbmUgPSBsaW5lO1xyXG4gIHRoaXMuZXJyb3JzID0gW107XHJcbn1cclxuXHJcbmZ1bmN0aW9uIFNoYWRlckVycm9yIChmaWxlTnVtYmVyLCBsaW5lTnVtYmVyLCBtZXNzYWdlKSB7XHJcbiAgdGhpcy5maWxlID0gZmlsZU51bWJlcjtcclxuICB0aGlzLmxpbmUgPSBsaW5lTnVtYmVyO1xyXG4gIHRoaXMubWVzc2FnZSA9IG1lc3NhZ2U7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGd1ZXNzQ29tbWFuZCAoKSB7XHJcbiAgdmFyIGVycm9yID0gbmV3IEVycm9yKCk7XHJcbiAgdmFyIHN0YWNrID0gKGVycm9yLnN0YWNrIHx8IGVycm9yKS50b1N0cmluZygpO1xyXG4gIHZhciBwYXQgPSAvY29tcGlsZVByb2NlZHVyZS4qXFxuXFxzKmF0LipcXCgoLiopXFwpLy5leGVjKHN0YWNrKTtcclxuICBpZiAocGF0KSB7XHJcbiAgICByZXR1cm4gcGF0WzFdXHJcbiAgfVxyXG4gIHZhciBwYXQyID0gL2NvbXBpbGVQcm9jZWR1cmUuKlxcblxccyphdFxccysoLiopKFxcbnwkKS8uZXhlYyhzdGFjayk7XHJcbiAgaWYgKHBhdDIpIHtcclxuICAgIHJldHVybiBwYXQyWzFdXHJcbiAgfVxyXG4gIHJldHVybiAndW5rbm93bidcclxufVxyXG5cclxuZnVuY3Rpb24gZ3Vlc3NDYWxsU2l0ZSAoKSB7XHJcbiAgdmFyIGVycm9yID0gbmV3IEVycm9yKCk7XHJcbiAgdmFyIHN0YWNrID0gKGVycm9yLnN0YWNrIHx8IGVycm9yKS50b1N0cmluZygpO1xyXG4gIHZhciBwYXQgPSAvYXQgUkVHTENvbW1hbmQuKlxcblxccythdC4qXFwoKC4qKVxcKS8uZXhlYyhzdGFjayk7XHJcbiAgaWYgKHBhdCkge1xyXG4gICAgcmV0dXJuIHBhdFsxXVxyXG4gIH1cclxuICB2YXIgcGF0MiA9IC9hdCBSRUdMQ29tbWFuZC4qXFxuXFxzK2F0XFxzKyguKilcXG4vLmV4ZWMoc3RhY2spO1xyXG4gIGlmIChwYXQyKSB7XHJcbiAgICByZXR1cm4gcGF0MlsxXVxyXG4gIH1cclxuICByZXR1cm4gJ3Vua25vd24nXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHBhcnNlU291cmNlIChzb3VyY2UsIGNvbW1hbmQpIHtcclxuICB2YXIgbGluZXMgPSBzb3VyY2Uuc3BsaXQoJ1xcbicpO1xyXG4gIHZhciBsaW5lTnVtYmVyID0gMTtcclxuICB2YXIgZmlsZU51bWJlciA9IDA7XHJcbiAgdmFyIGZpbGVzID0ge1xyXG4gICAgdW5rbm93bjogbmV3IFNoYWRlckZpbGUoKSxcclxuICAgIDA6IG5ldyBTaGFkZXJGaWxlKClcclxuICB9O1xyXG4gIGZpbGVzLnVua25vd24ubmFtZSA9IGZpbGVzWzBdLm5hbWUgPSBjb21tYW5kIHx8IGd1ZXNzQ29tbWFuZCgpO1xyXG4gIGZpbGVzLnVua25vd24ubGluZXMucHVzaChuZXcgU2hhZGVyTGluZSgwLCAnJykpO1xyXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGluZXMubGVuZ3RoOyArK2kpIHtcclxuICAgIHZhciBsaW5lID0gbGluZXNbaV07XHJcbiAgICB2YXIgcGFydHMgPSAvXlxccypcXCNcXHMqKFxcdyspXFxzKyguKylcXHMqJC8uZXhlYyhsaW5lKTtcclxuICAgIGlmIChwYXJ0cykge1xyXG4gICAgICBzd2l0Y2ggKHBhcnRzWzFdKSB7XHJcbiAgICAgICAgY2FzZSAnbGluZSc6XHJcbiAgICAgICAgICB2YXIgbGluZU51bWJlckluZm8gPSAvKFxcZCspKFxccytcXGQrKT8vLmV4ZWMocGFydHNbMl0pO1xyXG4gICAgICAgICAgaWYgKGxpbmVOdW1iZXJJbmZvKSB7XHJcbiAgICAgICAgICAgIGxpbmVOdW1iZXIgPSBsaW5lTnVtYmVySW5mb1sxXSB8IDA7XHJcbiAgICAgICAgICAgIGlmIChsaW5lTnVtYmVySW5mb1syXSkge1xyXG4gICAgICAgICAgICAgIGZpbGVOdW1iZXIgPSBsaW5lTnVtYmVySW5mb1syXSB8IDA7XHJcbiAgICAgICAgICAgICAgaWYgKCEoZmlsZU51bWJlciBpbiBmaWxlcykpIHtcclxuICAgICAgICAgICAgICAgIGZpbGVzW2ZpbGVOdW1iZXJdID0gbmV3IFNoYWRlckZpbGUoKTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgY2FzZSAnZGVmaW5lJzpcclxuICAgICAgICAgIHZhciBuYW1lSW5mbyA9IC9TSEFERVJfTkFNRShfQjY0KT9cXHMrKC4qKSQvLmV4ZWMocGFydHNbMl0pO1xyXG4gICAgICAgICAgaWYgKG5hbWVJbmZvKSB7XHJcbiAgICAgICAgICAgIGZpbGVzW2ZpbGVOdW1iZXJdLm5hbWUgPSAobmFtZUluZm9bMV1cclxuICAgICAgICAgICAgICAgID8gZGVjb2RlQjY0KG5hbWVJbmZvWzJdKVxyXG4gICAgICAgICAgICAgICAgOiBuYW1lSW5mb1syXSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBicmVha1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBmaWxlc1tmaWxlTnVtYmVyXS5saW5lcy5wdXNoKG5ldyBTaGFkZXJMaW5lKGxpbmVOdW1iZXIrKywgbGluZSkpO1xyXG4gIH1cclxuICBPYmplY3Qua2V5cyhmaWxlcykuZm9yRWFjaChmdW5jdGlvbiAoZmlsZU51bWJlcikge1xyXG4gICAgdmFyIGZpbGUgPSBmaWxlc1tmaWxlTnVtYmVyXTtcclxuICAgIGZpbGUubGluZXMuZm9yRWFjaChmdW5jdGlvbiAobGluZSkge1xyXG4gICAgICBmaWxlLmluZGV4W2xpbmUubnVtYmVyXSA9IGxpbmU7XHJcbiAgICB9KTtcclxuICB9KTtcclxuICByZXR1cm4gZmlsZXNcclxufVxyXG5cclxuZnVuY3Rpb24gcGFyc2VFcnJvckxvZyAoZXJyTG9nKSB7XHJcbiAgdmFyIHJlc3VsdCA9IFtdO1xyXG4gIGVyckxvZy5zcGxpdCgnXFxuJykuZm9yRWFjaChmdW5jdGlvbiAoZXJyTXNnKSB7XHJcbiAgICBpZiAoZXJyTXNnLmxlbmd0aCA8IDUpIHtcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcbiAgICB2YXIgcGFydHMgPSAvXkVSUk9SXFw6XFxzKyhcXGQrKVxcOihcXGQrKVxcOlxccyooLiopJC8uZXhlYyhlcnJNc2cpO1xyXG4gICAgaWYgKHBhcnRzKSB7XHJcbiAgICAgIHJlc3VsdC5wdXNoKG5ldyBTaGFkZXJFcnJvcihcclxuICAgICAgICBwYXJ0c1sxXSB8IDAsXHJcbiAgICAgICAgcGFydHNbMl0gfCAwLFxyXG4gICAgICAgIHBhcnRzWzNdLnRyaW0oKSkpO1xyXG4gICAgfSBlbHNlIGlmIChlcnJNc2cubGVuZ3RoID4gMCkge1xyXG4gICAgICByZXN1bHQucHVzaChuZXcgU2hhZGVyRXJyb3IoJ3Vua25vd24nLCAwLCBlcnJNc2cpKTtcclxuICAgIH1cclxuICB9KTtcclxuICByZXR1cm4gcmVzdWx0XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFubm90YXRlRmlsZXMgKGZpbGVzLCBlcnJvcnMpIHtcclxuICBlcnJvcnMuZm9yRWFjaChmdW5jdGlvbiAoZXJyb3IpIHtcclxuICAgIHZhciBmaWxlID0gZmlsZXNbZXJyb3IuZmlsZV07XHJcbiAgICBpZiAoZmlsZSkge1xyXG4gICAgICB2YXIgbGluZSA9IGZpbGUuaW5kZXhbZXJyb3IubGluZV07XHJcbiAgICAgIGlmIChsaW5lKSB7XHJcbiAgICAgICAgbGluZS5lcnJvcnMucHVzaChlcnJvcik7XHJcbiAgICAgICAgZmlsZS5oYXNFcnJvcnMgPSB0cnVlO1xyXG4gICAgICAgIHJldHVyblxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBmaWxlcy51bmtub3duLmhhc0Vycm9ycyA9IHRydWU7XHJcbiAgICBmaWxlcy51bmtub3duLmxpbmVzWzBdLmVycm9ycy5wdXNoKGVycm9yKTtcclxuICB9KTtcclxufVxyXG5cclxuZnVuY3Rpb24gY2hlY2tTaGFkZXJFcnJvciAoZ2wsIHNoYWRlciwgc291cmNlLCB0eXBlLCBjb21tYW5kKSB7XHJcbiAgaWYgKCFnbC5nZXRTaGFkZXJQYXJhbWV0ZXIoc2hhZGVyLCBnbC5DT01QSUxFX1NUQVRVUykpIHtcclxuICAgIHZhciBlcnJMb2cgPSBnbC5nZXRTaGFkZXJJbmZvTG9nKHNoYWRlcik7XHJcbiAgICB2YXIgdHlwZU5hbWUgPSB0eXBlID09PSBnbC5GUkFHTUVOVF9TSEFERVIgPyAnZnJhZ21lbnQnIDogJ3ZlcnRleCc7XHJcbiAgICBjaGVja0NvbW1hbmRUeXBlKHNvdXJjZSwgJ3N0cmluZycsIHR5cGVOYW1lICsgJyBzaGFkZXIgc291cmNlIG11c3QgYmUgYSBzdHJpbmcnLCBjb21tYW5kKTtcclxuICAgIHZhciBmaWxlcyA9IHBhcnNlU291cmNlKHNvdXJjZSwgY29tbWFuZCk7XHJcbiAgICB2YXIgZXJyb3JzID0gcGFyc2VFcnJvckxvZyhlcnJMb2cpO1xyXG4gICAgYW5ub3RhdGVGaWxlcyhmaWxlcywgZXJyb3JzKTtcclxuXHJcbiAgICBPYmplY3Qua2V5cyhmaWxlcykuZm9yRWFjaChmdW5jdGlvbiAoZmlsZU51bWJlcikge1xyXG4gICAgICB2YXIgZmlsZSA9IGZpbGVzW2ZpbGVOdW1iZXJdO1xyXG4gICAgICBpZiAoIWZpbGUuaGFzRXJyb3JzKSB7XHJcbiAgICAgICAgcmV0dXJuXHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHZhciBzdHJpbmdzID0gWycnXTtcclxuICAgICAgdmFyIHN0eWxlcyA9IFsnJ107XHJcblxyXG4gICAgICBmdW5jdGlvbiBwdXNoIChzdHIsIHN0eWxlKSB7XHJcbiAgICAgICAgc3RyaW5ncy5wdXNoKHN0cik7XHJcbiAgICAgICAgc3R5bGVzLnB1c2goc3R5bGUgfHwgJycpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBwdXNoKCdmaWxlIG51bWJlciAnICsgZmlsZU51bWJlciArICc6ICcgKyBmaWxlLm5hbWUgKyAnXFxuJywgJ2NvbG9yOnJlZDt0ZXh0LWRlY29yYXRpb246dW5kZXJsaW5lO2ZvbnQtd2VpZ2h0OmJvbGQnKTtcclxuXHJcbiAgICAgIGZpbGUubGluZXMuZm9yRWFjaChmdW5jdGlvbiAobGluZSkge1xyXG4gICAgICAgIGlmIChsaW5lLmVycm9ycy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICBwdXNoKGxlZnRQYWQobGluZS5udW1iZXIsIDQpICsgJ3wgICcsICdiYWNrZ3JvdW5kLWNvbG9yOnllbGxvdzsgZm9udC13ZWlnaHQ6Ym9sZCcpO1xyXG4gICAgICAgICAgcHVzaChsaW5lLmxpbmUgKyBlbmRsLCAnY29sb3I6cmVkOyBiYWNrZ3JvdW5kLWNvbG9yOnllbGxvdzsgZm9udC13ZWlnaHQ6Ym9sZCcpO1xyXG5cclxuICAgICAgICAgIC8vIHRyeSB0byBndWVzcyB0b2tlblxyXG4gICAgICAgICAgdmFyIG9mZnNldCA9IDA7XHJcbiAgICAgICAgICBsaW5lLmVycm9ycy5mb3JFYWNoKGZ1bmN0aW9uIChlcnJvcikge1xyXG4gICAgICAgICAgICB2YXIgbWVzc2FnZSA9IGVycm9yLm1lc3NhZ2U7XHJcbiAgICAgICAgICAgIHZhciB0b2tlbiA9IC9eXFxzKlxcJyguKilcXCdcXHMqXFw6XFxzKiguKikkLy5leGVjKG1lc3NhZ2UpO1xyXG4gICAgICAgICAgICBpZiAodG9rZW4pIHtcclxuICAgICAgICAgICAgICB2YXIgdG9rZW5QYXQgPSB0b2tlblsxXTtcclxuICAgICAgICAgICAgICBtZXNzYWdlID0gdG9rZW5bMl07XHJcbiAgICAgICAgICAgICAgc3dpdGNoICh0b2tlblBhdCkge1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnYXNzaWduJzpcclxuICAgICAgICAgICAgICAgICAgdG9rZW5QYXQgPSAnPSc7XHJcbiAgICAgICAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIG9mZnNldCA9IE1hdGgubWF4KGxpbmUubGluZS5pbmRleE9mKHRva2VuUGF0LCBvZmZzZXQpLCAwKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICBvZmZzZXQgPSAwO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBwdXNoKGxlZnRQYWQoJ3wgJywgNikpO1xyXG4gICAgICAgICAgICBwdXNoKGxlZnRQYWQoJ15eXicsIG9mZnNldCArIDMpICsgZW5kbCwgJ2ZvbnQtd2VpZ2h0OmJvbGQnKTtcclxuICAgICAgICAgICAgcHVzaChsZWZ0UGFkKCd8ICcsIDYpKTtcclxuICAgICAgICAgICAgcHVzaChtZXNzYWdlICsgZW5kbCwgJ2ZvbnQtd2VpZ2h0OmJvbGQnKTtcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgcHVzaChsZWZ0UGFkKCd8ICcsIDYpICsgZW5kbCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIHB1c2gobGVmdFBhZChsaW5lLm51bWJlciwgNCkgKyAnfCAgJyk7XHJcbiAgICAgICAgICBwdXNoKGxpbmUubGluZSArIGVuZGwsICdjb2xvcjpyZWQnKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG4gICAgICBpZiAodHlwZW9mIGRvY3VtZW50ICE9PSAndW5kZWZpbmVkJyAmJiAhd2luZG93LmNocm9tZSkge1xyXG4gICAgICAgIHN0eWxlc1swXSA9IHN0cmluZ3Muam9pbignJWMnKTtcclxuICAgICAgICBjb25zb2xlLmxvZy5hcHBseShjb25zb2xlLCBzdHlsZXMpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKHN0cmluZ3Muam9pbignJykpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICBjaGVjay5yYWlzZSgnRXJyb3IgY29tcGlsaW5nICcgKyB0eXBlTmFtZSArICcgc2hhZGVyLCAnICsgZmlsZXNbMF0ubmFtZSk7XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBjaGVja0xpbmtFcnJvciAoZ2wsIHByb2dyYW0sIGZyYWdTaGFkZXIsIHZlcnRTaGFkZXIsIGNvbW1hbmQpIHtcclxuICBpZiAoIWdsLmdldFByb2dyYW1QYXJhbWV0ZXIocHJvZ3JhbSwgZ2wuTElOS19TVEFUVVMpKSB7XHJcbiAgICB2YXIgZXJyTG9nID0gZ2wuZ2V0UHJvZ3JhbUluZm9Mb2cocHJvZ3JhbSk7XHJcbiAgICB2YXIgZnJhZ1BhcnNlID0gcGFyc2VTb3VyY2UoZnJhZ1NoYWRlciwgY29tbWFuZCk7XHJcbiAgICB2YXIgdmVydFBhcnNlID0gcGFyc2VTb3VyY2UodmVydFNoYWRlciwgY29tbWFuZCk7XHJcblxyXG4gICAgdmFyIGhlYWRlciA9ICdFcnJvciBsaW5raW5nIHByb2dyYW0gd2l0aCB2ZXJ0ZXggc2hhZGVyLCBcIicgK1xyXG4gICAgICB2ZXJ0UGFyc2VbMF0ubmFtZSArICdcIiwgYW5kIGZyYWdtZW50IHNoYWRlciBcIicgKyBmcmFnUGFyc2VbMF0ubmFtZSArICdcIic7XHJcblxyXG4gICAgaWYgKHR5cGVvZiBkb2N1bWVudCAhPT0gJ3VuZGVmaW5lZCcpIHtcclxuICAgICAgY29uc29sZS5sb2coJyVjJyArIGhlYWRlciArIGVuZGwgKyAnJWMnICsgZXJyTG9nLFxyXG4gICAgICAgICdjb2xvcjpyZWQ7dGV4dC1kZWNvcmF0aW9uOnVuZGVybGluZTtmb250LXdlaWdodDpib2xkJyxcclxuICAgICAgICAnY29sb3I6cmVkJyk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBjb25zb2xlLmxvZyhoZWFkZXIgKyBlbmRsICsgZXJyTG9nKTtcclxuICAgIH1cclxuICAgIGNoZWNrLnJhaXNlKGhlYWRlcik7XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBzYXZlQ29tbWFuZFJlZiAob2JqZWN0KSB7XHJcbiAgb2JqZWN0Ll9jb21tYW5kUmVmID0gZ3Vlc3NDb21tYW5kKCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNhdmVEcmF3Q29tbWFuZEluZm8gKG9wdHMsIHVuaWZvcm1zLCBhdHRyaWJ1dGVzLCBzdHJpbmdTdG9yZSkge1xyXG4gIHNhdmVDb21tYW5kUmVmKG9wdHMpO1xyXG5cclxuICBmdW5jdGlvbiBpZCAoc3RyKSB7XHJcbiAgICBpZiAoc3RyKSB7XHJcbiAgICAgIHJldHVybiBzdHJpbmdTdG9yZS5pZChzdHIpXHJcbiAgICB9XHJcbiAgICByZXR1cm4gMFxyXG4gIH1cclxuICBvcHRzLl9mcmFnSWQgPSBpZChvcHRzLnN0YXRpYy5mcmFnKTtcclxuICBvcHRzLl92ZXJ0SWQgPSBpZChvcHRzLnN0YXRpYy52ZXJ0KTtcclxuXHJcbiAgZnVuY3Rpb24gYWRkUHJvcHMgKGRpY3QsIHNldCkge1xyXG4gICAgT2JqZWN0LmtleXMoc2V0KS5mb3JFYWNoKGZ1bmN0aW9uICh1KSB7XHJcbiAgICAgIGRpY3Rbc3RyaW5nU3RvcmUuaWQodSldID0gdHJ1ZTtcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgdmFyIHVuaWZvcm1TZXQgPSBvcHRzLl91bmlmb3JtU2V0ID0ge307XHJcbiAgYWRkUHJvcHModW5pZm9ybVNldCwgdW5pZm9ybXMuc3RhdGljKTtcclxuICBhZGRQcm9wcyh1bmlmb3JtU2V0LCB1bmlmb3Jtcy5keW5hbWljKTtcclxuXHJcbiAgdmFyIGF0dHJpYnV0ZVNldCA9IG9wdHMuX2F0dHJpYnV0ZVNldCA9IHt9O1xyXG4gIGFkZFByb3BzKGF0dHJpYnV0ZVNldCwgYXR0cmlidXRlcy5zdGF0aWMpO1xyXG4gIGFkZFByb3BzKGF0dHJpYnV0ZVNldCwgYXR0cmlidXRlcy5keW5hbWljKTtcclxuXHJcbiAgb3B0cy5faGFzQ291bnQgPSAoXHJcbiAgICAnY291bnQnIGluIG9wdHMuc3RhdGljIHx8XHJcbiAgICAnY291bnQnIGluIG9wdHMuZHluYW1pYyB8fFxyXG4gICAgJ2VsZW1lbnRzJyBpbiBvcHRzLnN0YXRpYyB8fFxyXG4gICAgJ2VsZW1lbnRzJyBpbiBvcHRzLmR5bmFtaWMpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjb21tYW5kUmFpc2UgKG1lc3NhZ2UsIGNvbW1hbmQpIHtcclxuICB2YXIgY2FsbFNpdGUgPSBndWVzc0NhbGxTaXRlKCk7XHJcbiAgcmFpc2UobWVzc2FnZSArXHJcbiAgICAnIGluIGNvbW1hbmQgJyArIChjb21tYW5kIHx8IGd1ZXNzQ29tbWFuZCgpKSArXHJcbiAgICAoY2FsbFNpdGUgPT09ICd1bmtub3duJyA/ICcnIDogJyBjYWxsZWQgZnJvbSAnICsgY2FsbFNpdGUpKTtcclxufVxyXG5cclxuZnVuY3Rpb24gY2hlY2tDb21tYW5kIChwcmVkLCBtZXNzYWdlLCBjb21tYW5kKSB7XHJcbiAgaWYgKCFwcmVkKSB7XHJcbiAgICBjb21tYW5kUmFpc2UobWVzc2FnZSwgY29tbWFuZCB8fCBndWVzc0NvbW1hbmQoKSk7XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBjaGVja1BhcmFtZXRlckNvbW1hbmQgKHBhcmFtLCBwb3NzaWJpbGl0aWVzLCBtZXNzYWdlLCBjb21tYW5kKSB7XHJcbiAgaWYgKCEocGFyYW0gaW4gcG9zc2liaWxpdGllcykpIHtcclxuICAgIGNvbW1hbmRSYWlzZShcclxuICAgICAgJ3Vua25vd24gcGFyYW1ldGVyICgnICsgcGFyYW0gKyAnKScgKyBlbmNvbG9uKG1lc3NhZ2UpICtcclxuICAgICAgJy4gcG9zc2libGUgdmFsdWVzOiAnICsgT2JqZWN0LmtleXMocG9zc2liaWxpdGllcykuam9pbigpLFxyXG4gICAgICBjb21tYW5kIHx8IGd1ZXNzQ29tbWFuZCgpKTtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNoZWNrQ29tbWFuZFR5cGUgKHZhbHVlLCB0eXBlLCBtZXNzYWdlLCBjb21tYW5kKSB7XHJcbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gdHlwZSkge1xyXG4gICAgY29tbWFuZFJhaXNlKFxyXG4gICAgICAnaW52YWxpZCBwYXJhbWV0ZXIgdHlwZScgKyBlbmNvbG9uKG1lc3NhZ2UpICtcclxuICAgICAgJy4gZXhwZWN0ZWQgJyArIHR5cGUgKyAnLCBnb3QgJyArICh0eXBlb2YgdmFsdWUpLFxyXG4gICAgICBjb21tYW5kIHx8IGd1ZXNzQ29tbWFuZCgpKTtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNoZWNrT3B0aW9uYWwgKGJsb2NrKSB7XHJcbiAgYmxvY2soKTtcclxufVxyXG5cclxuZnVuY3Rpb24gY2hlY2tGcmFtZWJ1ZmZlckZvcm1hdCAoYXR0YWNobWVudCwgdGV4Rm9ybWF0cywgcmJGb3JtYXRzKSB7XHJcbiAgaWYgKGF0dGFjaG1lbnQudGV4dHVyZSkge1xyXG4gICAgY2hlY2tPbmVPZihcclxuICAgICAgYXR0YWNobWVudC50ZXh0dXJlLl90ZXh0dXJlLmludGVybmFsZm9ybWF0LFxyXG4gICAgICB0ZXhGb3JtYXRzLFxyXG4gICAgICAndW5zdXBwb3J0ZWQgdGV4dHVyZSBmb3JtYXQgZm9yIGF0dGFjaG1lbnQnKTtcclxuICB9IGVsc2Uge1xyXG4gICAgY2hlY2tPbmVPZihcclxuICAgICAgYXR0YWNobWVudC5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlci5mb3JtYXQsXHJcbiAgICAgIHJiRm9ybWF0cyxcclxuICAgICAgJ3Vuc3VwcG9ydGVkIHJlbmRlcmJ1ZmZlciBmb3JtYXQgZm9yIGF0dGFjaG1lbnQnKTtcclxuICB9XHJcbn1cclxuXHJcbnZhciBHTF9DTEFNUF9UT19FREdFID0gMHg4MTJGO1xyXG5cclxudmFyIEdMX05FQVJFU1QgPSAweDI2MDA7XHJcbnZhciBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNUID0gMHgyNzAwO1xyXG52YXIgR0xfTElORUFSX01JUE1BUF9ORUFSRVNUID0gMHgyNzAxO1xyXG52YXIgR0xfTkVBUkVTVF9NSVBNQVBfTElORUFSID0gMHgyNzAyO1xyXG52YXIgR0xfTElORUFSX01JUE1BUF9MSU5FQVIgPSAweDI3MDM7XHJcblxyXG52YXIgR0xfQllURSA9IDUxMjA7XHJcbnZhciBHTF9VTlNJR05FRF9CWVRFID0gNTEyMTtcclxudmFyIEdMX1NIT1JUID0gNTEyMjtcclxudmFyIEdMX1VOU0lHTkVEX1NIT1JUID0gNTEyMztcclxudmFyIEdMX0lOVCA9IDUxMjQ7XHJcbnZhciBHTF9VTlNJR05FRF9JTlQgPSA1MTI1O1xyXG52YXIgR0xfRkxPQVQgPSA1MTI2O1xyXG5cclxudmFyIEdMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzQgPSAweDgwMzM7XHJcbnZhciBHTF9VTlNJR05FRF9TSE9SVF81XzVfNV8xID0gMHg4MDM0O1xyXG52YXIgR0xfVU5TSUdORURfU0hPUlRfNV82XzUgPSAweDgzNjM7XHJcbnZhciBHTF9VTlNJR05FRF9JTlRfMjRfOF9XRUJHTCA9IDB4ODRGQTtcclxuXHJcbnZhciBHTF9IQUxGX0ZMT0FUX09FUyA9IDB4OEQ2MTtcclxuXHJcbnZhciBUWVBFX1NJWkUgPSB7fTtcclxuXHJcblRZUEVfU0laRVtHTF9CWVRFXSA9XHJcblRZUEVfU0laRVtHTF9VTlNJR05FRF9CWVRFXSA9IDE7XHJcblxyXG5UWVBFX1NJWkVbR0xfU0hPUlRdID1cclxuVFlQRV9TSVpFW0dMX1VOU0lHTkVEX1NIT1JUXSA9XHJcblRZUEVfU0laRVtHTF9IQUxGX0ZMT0FUX09FU10gPVxyXG5UWVBFX1NJWkVbR0xfVU5TSUdORURfU0hPUlRfNV82XzVdID1cclxuVFlQRV9TSVpFW0dMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzRdID1cclxuVFlQRV9TSVpFW0dMX1VOU0lHTkVEX1NIT1JUXzVfNV81XzFdID0gMjtcclxuXHJcblRZUEVfU0laRVtHTF9JTlRdID1cclxuVFlQRV9TSVpFW0dMX1VOU0lHTkVEX0lOVF0gPVxyXG5UWVBFX1NJWkVbR0xfRkxPQVRdID1cclxuVFlQRV9TSVpFW0dMX1VOU0lHTkVEX0lOVF8yNF84X1dFQkdMXSA9IDQ7XHJcblxyXG5mdW5jdGlvbiBwaXhlbFNpemUgKHR5cGUsIGNoYW5uZWxzKSB7XHJcbiAgaWYgKHR5cGUgPT09IEdMX1VOU0lHTkVEX1NIT1JUXzVfNV81XzEgfHxcclxuICAgICAgdHlwZSA9PT0gR0xfVU5TSUdORURfU0hPUlRfNF80XzRfNCB8fFxyXG4gICAgICB0eXBlID09PSBHTF9VTlNJR05FRF9TSE9SVF81XzZfNSkge1xyXG4gICAgcmV0dXJuIDJcclxuICB9IGVsc2UgaWYgKHR5cGUgPT09IEdMX1VOU0lHTkVEX0lOVF8yNF84X1dFQkdMKSB7XHJcbiAgICByZXR1cm4gNFxyXG4gIH0gZWxzZSB7XHJcbiAgICByZXR1cm4gVFlQRV9TSVpFW3R5cGVdICogY2hhbm5lbHNcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzUG93MiAodikge1xyXG4gIHJldHVybiAhKHYgJiAodiAtIDEpKSAmJiAoISF2KVxyXG59XHJcblxyXG5mdW5jdGlvbiBjaGVja1RleHR1cmUyRCAoaW5mbywgbWlwRGF0YSwgbGltaXRzKSB7XHJcbiAgdmFyIGk7XHJcbiAgdmFyIHcgPSBtaXBEYXRhLndpZHRoO1xyXG4gIHZhciBoID0gbWlwRGF0YS5oZWlnaHQ7XHJcbiAgdmFyIGMgPSBtaXBEYXRhLmNoYW5uZWxzO1xyXG5cclxuICAvLyBDaGVjayB0ZXh0dXJlIHNoYXBlXHJcbiAgY2hlY2sodyA+IDAgJiYgdyA8PSBsaW1pdHMubWF4VGV4dHVyZVNpemUgJiZcclxuICAgICAgICBoID4gMCAmJiBoIDw9IGxpbWl0cy5tYXhUZXh0dXJlU2l6ZSxcclxuICAgICAgICAnaW52YWxpZCB0ZXh0dXJlIHNoYXBlJyk7XHJcblxyXG4gIC8vIGNoZWNrIHdyYXAgbW9kZVxyXG4gIGlmIChpbmZvLndyYXBTICE9PSBHTF9DTEFNUF9UT19FREdFIHx8IGluZm8ud3JhcFQgIT09IEdMX0NMQU1QX1RPX0VER0UpIHtcclxuICAgIGNoZWNrKGlzUG93Mih3KSAmJiBpc1BvdzIoaCksXHJcbiAgICAgICdpbmNvbXBhdGlibGUgd3JhcCBtb2RlIGZvciB0ZXh0dXJlLCBib3RoIHdpZHRoIGFuZCBoZWlnaHQgbXVzdCBiZSBwb3dlciBvZiAyJyk7XHJcbiAgfVxyXG5cclxuICBpZiAobWlwRGF0YS5taXBtYXNrID09PSAxKSB7XHJcbiAgICBpZiAodyAhPT0gMSAmJiBoICE9PSAxKSB7XHJcbiAgICAgIGNoZWNrKFxyXG4gICAgICAgIGluZm8ubWluRmlsdGVyICE9PSBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNUICYmXHJcbiAgICAgICAgaW5mby5taW5GaWx0ZXIgIT09IEdMX05FQVJFU1RfTUlQTUFQX0xJTkVBUiAmJlxyXG4gICAgICAgIGluZm8ubWluRmlsdGVyICE9PSBHTF9MSU5FQVJfTUlQTUFQX05FQVJFU1QgJiZcclxuICAgICAgICBpbmZvLm1pbkZpbHRlciAhPT0gR0xfTElORUFSX01JUE1BUF9MSU5FQVIsXHJcbiAgICAgICAgJ21pbiBmaWx0ZXIgcmVxdWlyZXMgbWlwbWFwJyk7XHJcbiAgICB9XHJcbiAgfSBlbHNlIHtcclxuICAgIC8vIHRleHR1cmUgbXVzdCBiZSBwb3dlciBvZiAyXHJcbiAgICBjaGVjayhpc1BvdzIodykgJiYgaXNQb3cyKGgpLFxyXG4gICAgICAndGV4dHVyZSBtdXN0IGJlIGEgc3F1YXJlIHBvd2VyIG9mIDIgdG8gc3VwcG9ydCBtaXBtYXBwaW5nJyk7XHJcbiAgICBjaGVjayhtaXBEYXRhLm1pcG1hc2sgPT09ICh3IDw8IDEpIC0gMSxcclxuICAgICAgJ21pc3Npbmcgb3IgaW5jb21wbGV0ZSBtaXBtYXAgZGF0YScpO1xyXG4gIH1cclxuXHJcbiAgaWYgKG1pcERhdGEudHlwZSA9PT0gR0xfRkxPQVQpIHtcclxuICAgIGlmIChsaW1pdHMuZXh0ZW5zaW9ucy5pbmRleE9mKCdvZXNfdGV4dHVyZV9mbG9hdF9saW5lYXInKSA8IDApIHtcclxuICAgICAgY2hlY2soaW5mby5taW5GaWx0ZXIgPT09IEdMX05FQVJFU1QgJiYgaW5mby5tYWdGaWx0ZXIgPT09IEdMX05FQVJFU1QsXHJcbiAgICAgICAgJ2ZpbHRlciBub3Qgc3VwcG9ydGVkLCBtdXN0IGVuYWJsZSBvZXNfdGV4dHVyZV9mbG9hdF9saW5lYXInKTtcclxuICAgIH1cclxuICAgIGNoZWNrKCFpbmZvLmdlbk1pcG1hcHMsXHJcbiAgICAgICdtaXBtYXAgZ2VuZXJhdGlvbiBub3Qgc3VwcG9ydGVkIHdpdGggZmxvYXQgdGV4dHVyZXMnKTtcclxuICB9XHJcblxyXG4gIC8vIGNoZWNrIGltYWdlIGNvbXBsZXRlXHJcbiAgdmFyIG1pcGltYWdlcyA9IG1pcERhdGEuaW1hZ2VzO1xyXG4gIGZvciAoaSA9IDA7IGkgPCAxNjsgKytpKSB7XHJcbiAgICBpZiAobWlwaW1hZ2VzW2ldKSB7XHJcbiAgICAgIHZhciBtdyA9IHcgPj4gaTtcclxuICAgICAgdmFyIG1oID0gaCA+PiBpO1xyXG4gICAgICBjaGVjayhtaXBEYXRhLm1pcG1hc2sgJiAoMSA8PCBpKSwgJ21pc3NpbmcgbWlwbWFwIGRhdGEnKTtcclxuXHJcbiAgICAgIHZhciBpbWcgPSBtaXBpbWFnZXNbaV07XHJcblxyXG4gICAgICBjaGVjayhcclxuICAgICAgICBpbWcud2lkdGggPT09IG13ICYmXHJcbiAgICAgICAgaW1nLmhlaWdodCA9PT0gbWgsXHJcbiAgICAgICAgJ2ludmFsaWQgc2hhcGUgZm9yIG1pcCBpbWFnZXMnKTtcclxuXHJcbiAgICAgIGNoZWNrKFxyXG4gICAgICAgIGltZy5mb3JtYXQgPT09IG1pcERhdGEuZm9ybWF0ICYmXHJcbiAgICAgICAgaW1nLmludGVybmFsZm9ybWF0ID09PSBtaXBEYXRhLmludGVybmFsZm9ybWF0ICYmXHJcbiAgICAgICAgaW1nLnR5cGUgPT09IG1pcERhdGEudHlwZSxcclxuICAgICAgICAnaW5jb21wYXRpYmxlIHR5cGUgZm9yIG1pcCBpbWFnZScpO1xyXG5cclxuICAgICAgaWYgKGltZy5jb21wcmVzc2VkKSB7XHJcbiAgICAgICAgLy8gVE9ETzogY2hlY2sgc2l6ZSBmb3IgY29tcHJlc3NlZCBpbWFnZXNcclxuICAgICAgfSBlbHNlIGlmIChpbWcuZGF0YSkge1xyXG4gICAgICAgIC8vIGNoZWNrKGltZy5kYXRhLmJ5dGVMZW5ndGggPT09IG13ICogbWggKlxyXG4gICAgICAgIC8vIE1hdGgubWF4KHBpeGVsU2l6ZShpbWcudHlwZSwgYyksIGltZy51bnBhY2tBbGlnbm1lbnQpLFxyXG4gICAgICAgIHZhciByb3dTaXplID0gTWF0aC5jZWlsKHBpeGVsU2l6ZShpbWcudHlwZSwgYykgKiBtdyAvIGltZy51bnBhY2tBbGlnbm1lbnQpICogaW1nLnVucGFja0FsaWdubWVudDtcclxuICAgICAgICBjaGVjayhpbWcuZGF0YS5ieXRlTGVuZ3RoID09PSByb3dTaXplICogbWgsXHJcbiAgICAgICAgICAnaW52YWxpZCBkYXRhIGZvciBpbWFnZSwgYnVmZmVyIHNpemUgaXMgaW5jb25zaXN0ZW50IHdpdGggaW1hZ2UgZm9ybWF0Jyk7XHJcbiAgICAgIH0gZWxzZSBpZiAoaW1nLmVsZW1lbnQpIHtcclxuICAgICAgICAvLyBUT0RPOiBjaGVjayBlbGVtZW50IGNhbiBiZSBsb2FkZWRcclxuICAgICAgfSBlbHNlIGlmIChpbWcuY29weSkge1xyXG4gICAgICAgIC8vIFRPRE86IGNoZWNrIGNvbXBhdGlibGUgZm9ybWF0IGFuZCB0eXBlXHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSBpZiAoIWluZm8uZ2VuTWlwbWFwcykge1xyXG4gICAgICBjaGVjaygobWlwRGF0YS5taXBtYXNrICYgKDEgPDwgaSkpID09PSAwLCAnZXh0cmEgbWlwbWFwIGRhdGEnKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGlmIChtaXBEYXRhLmNvbXByZXNzZWQpIHtcclxuICAgIGNoZWNrKCFpbmZvLmdlbk1pcG1hcHMsXHJcbiAgICAgICdtaXBtYXAgZ2VuZXJhdGlvbiBmb3IgY29tcHJlc3NlZCBpbWFnZXMgbm90IHN1cHBvcnRlZCcpO1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gY2hlY2tUZXh0dXJlQ3ViZSAodGV4dHVyZSwgaW5mbywgZmFjZXMsIGxpbWl0cykge1xyXG4gIHZhciB3ID0gdGV4dHVyZS53aWR0aDtcclxuICB2YXIgaCA9IHRleHR1cmUuaGVpZ2h0O1xyXG4gIHZhciBjID0gdGV4dHVyZS5jaGFubmVscztcclxuXHJcbiAgLy8gQ2hlY2sgdGV4dHVyZSBzaGFwZVxyXG4gIGNoZWNrKFxyXG4gICAgdyA+IDAgJiYgdyA8PSBsaW1pdHMubWF4VGV4dHVyZVNpemUgJiYgaCA+IDAgJiYgaCA8PSBsaW1pdHMubWF4VGV4dHVyZVNpemUsXHJcbiAgICAnaW52YWxpZCB0ZXh0dXJlIHNoYXBlJyk7XHJcbiAgY2hlY2soXHJcbiAgICB3ID09PSBoLFxyXG4gICAgJ2N1YmUgbWFwIG11c3QgYmUgc3F1YXJlJyk7XHJcbiAgY2hlY2soXHJcbiAgICBpbmZvLndyYXBTID09PSBHTF9DTEFNUF9UT19FREdFICYmIGluZm8ud3JhcFQgPT09IEdMX0NMQU1QX1RPX0VER0UsXHJcbiAgICAnd3JhcCBtb2RlIG5vdCBzdXBwb3J0ZWQgYnkgY3ViZSBtYXAnKTtcclxuXHJcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBmYWNlcy5sZW5ndGg7ICsraSkge1xyXG4gICAgdmFyIGZhY2UgPSBmYWNlc1tpXTtcclxuICAgIGNoZWNrKFxyXG4gICAgICBmYWNlLndpZHRoID09PSB3ICYmIGZhY2UuaGVpZ2h0ID09PSBoLFxyXG4gICAgICAnaW5jb25zaXN0ZW50IGN1YmUgbWFwIGZhY2Ugc2hhcGUnKTtcclxuXHJcbiAgICBpZiAoaW5mby5nZW5NaXBtYXBzKSB7XHJcbiAgICAgIGNoZWNrKCFmYWNlLmNvbXByZXNzZWQsXHJcbiAgICAgICAgJ2NhbiBub3QgZ2VuZXJhdGUgbWlwbWFwIGZvciBjb21wcmVzc2VkIHRleHR1cmVzJyk7XHJcbiAgICAgIGNoZWNrKGZhY2UubWlwbWFzayA9PT0gMSxcclxuICAgICAgICAnY2FuIG5vdCBzcGVjaWZ5IG1pcG1hcHMgYW5kIGdlbmVyYXRlIG1pcG1hcHMnKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIC8vIFRPRE86IGNoZWNrIG1pcCBhbmQgZmlsdGVyIG1vZGVcclxuICAgIH1cclxuXHJcbiAgICB2YXIgbWlwbWFwcyA9IGZhY2UuaW1hZ2VzO1xyXG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCAxNjsgKytqKSB7XHJcbiAgICAgIHZhciBpbWcgPSBtaXBtYXBzW2pdO1xyXG4gICAgICBpZiAoaW1nKSB7XHJcbiAgICAgICAgdmFyIG13ID0gdyA+PiBqO1xyXG4gICAgICAgIHZhciBtaCA9IGggPj4gajtcclxuICAgICAgICBjaGVjayhmYWNlLm1pcG1hc2sgJiAoMSA8PCBqKSwgJ21pc3NpbmcgbWlwbWFwIGRhdGEnKTtcclxuICAgICAgICBjaGVjayhcclxuICAgICAgICAgIGltZy53aWR0aCA9PT0gbXcgJiZcclxuICAgICAgICAgIGltZy5oZWlnaHQgPT09IG1oLFxyXG4gICAgICAgICAgJ2ludmFsaWQgc2hhcGUgZm9yIG1pcCBpbWFnZXMnKTtcclxuICAgICAgICBjaGVjayhcclxuICAgICAgICAgIGltZy5mb3JtYXQgPT09IHRleHR1cmUuZm9ybWF0ICYmXHJcbiAgICAgICAgICBpbWcuaW50ZXJuYWxmb3JtYXQgPT09IHRleHR1cmUuaW50ZXJuYWxmb3JtYXQgJiZcclxuICAgICAgICAgIGltZy50eXBlID09PSB0ZXh0dXJlLnR5cGUsXHJcbiAgICAgICAgICAnaW5jb21wYXRpYmxlIHR5cGUgZm9yIG1pcCBpbWFnZScpO1xyXG5cclxuICAgICAgICBpZiAoaW1nLmNvbXByZXNzZWQpIHtcclxuICAgICAgICAgIC8vIFRPRE86IGNoZWNrIHNpemUgZm9yIGNvbXByZXNzZWQgaW1hZ2VzXHJcbiAgICAgICAgfSBlbHNlIGlmIChpbWcuZGF0YSkge1xyXG4gICAgICAgICAgY2hlY2soaW1nLmRhdGEuYnl0ZUxlbmd0aCA9PT0gbXcgKiBtaCAqXHJcbiAgICAgICAgICAgIE1hdGgubWF4KHBpeGVsU2l6ZShpbWcudHlwZSwgYyksIGltZy51bnBhY2tBbGlnbm1lbnQpLFxyXG4gICAgICAgICAgICAnaW52YWxpZCBkYXRhIGZvciBpbWFnZSwgYnVmZmVyIHNpemUgaXMgaW5jb25zaXN0ZW50IHdpdGggaW1hZ2UgZm9ybWF0Jyk7XHJcbiAgICAgICAgfSBlbHNlIGlmIChpbWcuZWxlbWVudCkge1xyXG4gICAgICAgICAgLy8gVE9ETzogY2hlY2sgZWxlbWVudCBjYW4gYmUgbG9hZGVkXHJcbiAgICAgICAgfSBlbHNlIGlmIChpbWcuY29weSkge1xyXG4gICAgICAgICAgLy8gVE9ETzogY2hlY2sgY29tcGF0aWJsZSBmb3JtYXQgYW5kIHR5cGVcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbnZhciBjaGVjayQxID0gZXh0ZW5kKGNoZWNrLCB7XHJcbiAgb3B0aW9uYWw6IGNoZWNrT3B0aW9uYWwsXHJcbiAgcmFpc2U6IHJhaXNlLFxyXG4gIGNvbW1hbmRSYWlzZTogY29tbWFuZFJhaXNlLFxyXG4gIGNvbW1hbmQ6IGNoZWNrQ29tbWFuZCxcclxuICBwYXJhbWV0ZXI6IGNoZWNrUGFyYW1ldGVyLFxyXG4gIGNvbW1hbmRQYXJhbWV0ZXI6IGNoZWNrUGFyYW1ldGVyQ29tbWFuZCxcclxuICBjb25zdHJ1Y3RvcjogY2hlY2tDb25zdHJ1Y3RvcixcclxuICB0eXBlOiBjaGVja1R5cGVPZixcclxuICBjb21tYW5kVHlwZTogY2hlY2tDb21tYW5kVHlwZSxcclxuICBpc1R5cGVkQXJyYXk6IGNoZWNrSXNUeXBlZEFycmF5LFxyXG4gIG5uaTogY2hlY2tOb25OZWdhdGl2ZUludCxcclxuICBvbmVPZjogY2hlY2tPbmVPZixcclxuICBzaGFkZXJFcnJvcjogY2hlY2tTaGFkZXJFcnJvcixcclxuICBsaW5rRXJyb3I6IGNoZWNrTGlua0Vycm9yLFxyXG4gIGNhbGxTaXRlOiBndWVzc0NhbGxTaXRlLFxyXG4gIHNhdmVDb21tYW5kUmVmOiBzYXZlQ29tbWFuZFJlZixcclxuICBzYXZlRHJhd0luZm86IHNhdmVEcmF3Q29tbWFuZEluZm8sXHJcbiAgZnJhbWVidWZmZXJGb3JtYXQ6IGNoZWNrRnJhbWVidWZmZXJGb3JtYXQsXHJcbiAgZ3Vlc3NDb21tYW5kOiBndWVzc0NvbW1hbmQsXHJcbiAgdGV4dHVyZTJEOiBjaGVja1RleHR1cmUyRCxcclxuICB0ZXh0dXJlQ3ViZTogY2hlY2tUZXh0dXJlQ3ViZVxyXG59KTtcblxudmFyIFZBUklBQkxFX0NPVU5URVIgPSAwO1xyXG5cclxudmFyIERZTl9GVU5DID0gMDtcclxuXHJcbmZ1bmN0aW9uIER5bmFtaWNWYXJpYWJsZSAodHlwZSwgZGF0YSkge1xyXG4gIHRoaXMuaWQgPSAoVkFSSUFCTEVfQ09VTlRFUisrKTtcclxuICB0aGlzLnR5cGUgPSB0eXBlO1xyXG4gIHRoaXMuZGF0YSA9IGRhdGE7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGVzY2FwZVN0ciAoc3RyKSB7XHJcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9cXFxcL2csICdcXFxcXFxcXCcpLnJlcGxhY2UoL1wiL2csICdcXFxcXCInKVxyXG59XHJcblxyXG5mdW5jdGlvbiBzcGxpdFBhcnRzIChzdHIpIHtcclxuICBpZiAoc3RyLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgcmV0dXJuIFtdXHJcbiAgfVxyXG5cclxuICB2YXIgZmlyc3RDaGFyID0gc3RyLmNoYXJBdCgwKTtcclxuICB2YXIgbGFzdENoYXIgPSBzdHIuY2hhckF0KHN0ci5sZW5ndGggLSAxKTtcclxuXHJcbiAgaWYgKHN0ci5sZW5ndGggPiAxICYmXHJcbiAgICAgIGZpcnN0Q2hhciA9PT0gbGFzdENoYXIgJiZcclxuICAgICAgKGZpcnN0Q2hhciA9PT0gJ1wiJyB8fCBmaXJzdENoYXIgPT09IFwiJ1wiKSkge1xyXG4gICAgcmV0dXJuIFsnXCInICsgZXNjYXBlU3RyKHN0ci5zdWJzdHIoMSwgc3RyLmxlbmd0aCAtIDIpKSArICdcIiddXHJcbiAgfVxyXG5cclxuICB2YXIgcGFydHMgPSAvXFxbKGZhbHNlfHRydWV8bnVsbHxcXGQrfCdbXiddKid8XCJbXlwiXSpcIilcXF0vLmV4ZWMoc3RyKTtcclxuICBpZiAocGFydHMpIHtcclxuICAgIHJldHVybiAoXHJcbiAgICAgIHNwbGl0UGFydHMoc3RyLnN1YnN0cigwLCBwYXJ0cy5pbmRleCkpXHJcbiAgICAgIC5jb25jYXQoc3BsaXRQYXJ0cyhwYXJ0c1sxXSkpXHJcbiAgICAgIC5jb25jYXQoc3BsaXRQYXJ0cyhzdHIuc3Vic3RyKHBhcnRzLmluZGV4ICsgcGFydHNbMF0ubGVuZ3RoKSkpXHJcbiAgICApXHJcbiAgfVxyXG5cclxuICB2YXIgc3VicGFydHMgPSBzdHIuc3BsaXQoJy4nKTtcclxuICBpZiAoc3VicGFydHMubGVuZ3RoID09PSAxKSB7XHJcbiAgICByZXR1cm4gWydcIicgKyBlc2NhcGVTdHIoc3RyKSArICdcIiddXHJcbiAgfVxyXG5cclxuICB2YXIgcmVzdWx0ID0gW107XHJcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdWJwYXJ0cy5sZW5ndGg7ICsraSkge1xyXG4gICAgcmVzdWx0ID0gcmVzdWx0LmNvbmNhdChzcGxpdFBhcnRzKHN1YnBhcnRzW2ldKSk7XHJcbiAgfVxyXG4gIHJldHVybiByZXN1bHRcclxufVxyXG5cclxuZnVuY3Rpb24gdG9BY2Nlc3NvclN0cmluZyAoc3RyKSB7XHJcbiAgcmV0dXJuICdbJyArIHNwbGl0UGFydHMoc3RyKS5qb2luKCddWycpICsgJ10nXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRlZmluZUR5bmFtaWMgKHR5cGUsIGRhdGEpIHtcclxuICByZXR1cm4gbmV3IER5bmFtaWNWYXJpYWJsZSh0eXBlLCB0b0FjY2Vzc29yU3RyaW5nKGRhdGEgKyAnJykpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzRHluYW1pYyAoeCkge1xyXG4gIHJldHVybiAodHlwZW9mIHggPT09ICdmdW5jdGlvbicgJiYgIXguX3JlZ2xUeXBlKSB8fFxyXG4gICAgICAgICB4IGluc3RhbmNlb2YgRHluYW1pY1ZhcmlhYmxlXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHVuYm94ICh4LCBwYXRoKSB7XHJcbiAgaWYgKHR5cGVvZiB4ID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICByZXR1cm4gbmV3IER5bmFtaWNWYXJpYWJsZShEWU5fRlVOQywgeClcclxuICB9XHJcbiAgcmV0dXJuIHhcclxufVxyXG5cclxudmFyIGR5bmFtaWMgPSB7XHJcbiAgRHluYW1pY1ZhcmlhYmxlOiBEeW5hbWljVmFyaWFibGUsXHJcbiAgZGVmaW5lOiBkZWZpbmVEeW5hbWljLFxyXG4gIGlzRHluYW1pYzogaXNEeW5hbWljLFxyXG4gIHVuYm94OiB1bmJveCxcclxuICBhY2Nlc3NvcjogdG9BY2Nlc3NvclN0cmluZ1xyXG59O1xuXG4vKiBnbG9iYWxzIHJlcXVlc3RBbmltYXRpb25GcmFtZSwgY2FuY2VsQW5pbWF0aW9uRnJhbWUgKi9cclxudmFyIHJhZiA9IHtcclxuICBuZXh0OiB0eXBlb2YgcmVxdWVzdEFuaW1hdGlvbkZyYW1lID09PSAnZnVuY3Rpb24nXHJcbiAgICA/IGZ1bmN0aW9uIChjYikgeyByZXR1cm4gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGNiKSB9XHJcbiAgICA6IGZ1bmN0aW9uIChjYikgeyByZXR1cm4gc2V0VGltZW91dChjYiwgMTYpIH0sXHJcbiAgY2FuY2VsOiB0eXBlb2YgY2FuY2VsQW5pbWF0aW9uRnJhbWUgPT09ICdmdW5jdGlvbidcclxuICAgID8gZnVuY3Rpb24gKHJhZikgeyByZXR1cm4gY2FuY2VsQW5pbWF0aW9uRnJhbWUocmFmKSB9XHJcbiAgICA6IGNsZWFyVGltZW91dFxyXG59O1xuXG4vKiBnbG9iYWxzIHBlcmZvcm1hbmNlICovXHJcbnZhciBjbG9jayA9ICh0eXBlb2YgcGVyZm9ybWFuY2UgIT09ICd1bmRlZmluZWQnICYmIHBlcmZvcm1hbmNlLm5vdylcclxuICA/IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHBlcmZvcm1hbmNlLm5vdygpIH1cclxuICA6IGZ1bmN0aW9uICgpIHsgcmV0dXJuICsobmV3IERhdGUoKSkgfTtcblxuZnVuY3Rpb24gY3JlYXRlU3RyaW5nU3RvcmUgKCkge1xyXG4gIHZhciBzdHJpbmdJZHMgPSB7Jyc6IDB9O1xyXG4gIHZhciBzdHJpbmdWYWx1ZXMgPSBbJyddO1xyXG4gIHJldHVybiB7XHJcbiAgICBpZDogZnVuY3Rpb24gKHN0cikge1xyXG4gICAgICB2YXIgcmVzdWx0ID0gc3RyaW5nSWRzW3N0cl07XHJcbiAgICAgIGlmIChyZXN1bHQpIHtcclxuICAgICAgICByZXR1cm4gcmVzdWx0XHJcbiAgICAgIH1cclxuICAgICAgcmVzdWx0ID0gc3RyaW5nSWRzW3N0cl0gPSBzdHJpbmdWYWx1ZXMubGVuZ3RoO1xyXG4gICAgICBzdHJpbmdWYWx1ZXMucHVzaChzdHIpO1xyXG4gICAgICByZXR1cm4gcmVzdWx0XHJcbiAgICB9LFxyXG5cclxuICAgIHN0cjogZnVuY3Rpb24gKGlkKSB7XHJcbiAgICAgIHJldHVybiBzdHJpbmdWYWx1ZXNbaWRdXHJcbiAgICB9XHJcbiAgfVxyXG59XG5cbi8vIENvbnRleHQgYW5kIGNhbnZhcyBjcmVhdGlvbiBoZWxwZXIgZnVuY3Rpb25zXHJcbmZ1bmN0aW9uIGNyZWF0ZUNhbnZhcyAoZWxlbWVudCwgb25Eb25lLCBwaXhlbFJhdGlvKSB7XHJcbiAgdmFyIGNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpO1xyXG4gIGV4dGVuZChjYW52YXMuc3R5bGUsIHtcclxuICAgIGJvcmRlcjogMCxcclxuICAgIG1hcmdpbjogMCxcclxuICAgIHBhZGRpbmc6IDAsXHJcbiAgICB0b3A6IDAsXHJcbiAgICBsZWZ0OiAwXHJcbiAgfSk7XHJcbiAgZWxlbWVudC5hcHBlbmRDaGlsZChjYW52YXMpO1xyXG5cclxuICBpZiAoZWxlbWVudCA9PT0gZG9jdW1lbnQuYm9keSkge1xyXG4gICAgY2FudmFzLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcclxuICAgIGV4dGVuZChlbGVtZW50LnN0eWxlLCB7XHJcbiAgICAgIG1hcmdpbjogMCxcclxuICAgICAgcGFkZGluZzogMFxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiByZXNpemUgKCkge1xyXG4gICAgdmFyIHcgPSB3aW5kb3cuaW5uZXJXaWR0aDtcclxuICAgIHZhciBoID0gd2luZG93LmlubmVySGVpZ2h0O1xyXG4gICAgaWYgKGVsZW1lbnQgIT09IGRvY3VtZW50LmJvZHkpIHtcclxuICAgICAgdmFyIGJvdW5kcyA9IGVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgIHcgPSBib3VuZHMucmlnaHQgLSBib3VuZHMubGVmdDtcclxuICAgICAgaCA9IGJvdW5kcy5ib3R0b20gLSBib3VuZHMudG9wO1xyXG4gICAgfVxyXG4gICAgY2FudmFzLndpZHRoID0gcGl4ZWxSYXRpbyAqIHc7XHJcbiAgICBjYW52YXMuaGVpZ2h0ID0gcGl4ZWxSYXRpbyAqIGg7XHJcbiAgICBleHRlbmQoY2FudmFzLnN0eWxlLCB7XHJcbiAgICAgIHdpZHRoOiB3ICsgJ3B4JyxcclxuICAgICAgaGVpZ2h0OiBoICsgJ3B4J1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgcmVzaXplLCBmYWxzZSk7XHJcblxyXG4gIGZ1bmN0aW9uIG9uRGVzdHJveSAoKSB7XHJcbiAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigncmVzaXplJywgcmVzaXplKTtcclxuICAgIGVsZW1lbnQucmVtb3ZlQ2hpbGQoY2FudmFzKTtcclxuICB9XHJcblxyXG4gIHJlc2l6ZSgpO1xyXG5cclxuICByZXR1cm4ge1xyXG4gICAgY2FudmFzOiBjYW52YXMsXHJcbiAgICBvbkRlc3Ryb3k6IG9uRGVzdHJveVxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlQ29udGV4dCAoY2FudmFzLCBjb250ZXh0QXR0cmlidXRlcykge1xyXG4gIGZ1bmN0aW9uIGdldCAobmFtZSkge1xyXG4gICAgdHJ5IHtcclxuICAgICAgcmV0dXJuIGNhbnZhcy5nZXRDb250ZXh0KG5hbWUsIGNvbnRleHRBdHRyaWJ1dGVzKVxyXG4gICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICByZXR1cm4gbnVsbFxyXG4gICAgfVxyXG4gIH1cclxuICByZXR1cm4gKFxyXG4gICAgZ2V0KCd3ZWJnbCcpIHx8XHJcbiAgICBnZXQoJ2V4cGVyaW1lbnRhbC13ZWJnbCcpIHx8XHJcbiAgICBnZXQoJ3dlYmdsLWV4cGVyaW1lbnRhbCcpXHJcbiAgKVxyXG59XHJcblxyXG5mdW5jdGlvbiBpc0hUTUxFbGVtZW50IChvYmopIHtcclxuICByZXR1cm4gKFxyXG4gICAgdHlwZW9mIG9iai5ub2RlTmFtZSA9PT0gJ3N0cmluZycgJiZcclxuICAgIHR5cGVvZiBvYmouYXBwZW5kQ2hpbGQgPT09ICdmdW5jdGlvbicgJiZcclxuICAgIHR5cGVvZiBvYmouZ2V0Qm91bmRpbmdDbGllbnRSZWN0ID09PSAnZnVuY3Rpb24nXHJcbiAgKVxyXG59XHJcblxyXG5mdW5jdGlvbiBpc1dlYkdMQ29udGV4dCAob2JqKSB7XHJcbiAgcmV0dXJuIChcclxuICAgIHR5cGVvZiBvYmouZHJhd0FycmF5cyA9PT0gJ2Z1bmN0aW9uJyB8fFxyXG4gICAgdHlwZW9mIG9iai5kcmF3RWxlbWVudHMgPT09ICdmdW5jdGlvbidcclxuICApXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHBhcnNlRXh0ZW5zaW9ucyAoaW5wdXQpIHtcclxuICBpZiAodHlwZW9mIGlucHV0ID09PSAnc3RyaW5nJykge1xyXG4gICAgcmV0dXJuIGlucHV0LnNwbGl0KClcclxuICB9XHJcbiAgY2hlY2skMShBcnJheS5pc0FycmF5KGlucHV0KSwgJ2ludmFsaWQgZXh0ZW5zaW9uIGFycmF5Jyk7XHJcbiAgcmV0dXJuIGlucHV0XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldEVsZW1lbnQgKGRlc2MpIHtcclxuICBpZiAodHlwZW9mIGRlc2MgPT09ICdzdHJpbmcnKSB7XHJcbiAgICBjaGVjayQxKHR5cGVvZiBkb2N1bWVudCAhPT0gJ3VuZGVmaW5lZCcsICdub3Qgc3VwcG9ydGVkIG91dHNpZGUgb2YgRE9NJyk7XHJcbiAgICByZXR1cm4gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihkZXNjKVxyXG4gIH1cclxuICByZXR1cm4gZGVzY1xyXG59XHJcblxyXG5mdW5jdGlvbiBwYXJzZUFyZ3MgKGFyZ3NfKSB7XHJcbiAgdmFyIGFyZ3MgPSBhcmdzXyB8fCB7fTtcclxuICB2YXIgZWxlbWVudCwgY29udGFpbmVyLCBjYW52YXMsIGdsO1xyXG4gIHZhciBjb250ZXh0QXR0cmlidXRlcyA9IHt9O1xyXG4gIHZhciBleHRlbnNpb25zID0gW107XHJcbiAgdmFyIG9wdGlvbmFsRXh0ZW5zaW9ucyA9IFtdO1xyXG4gIHZhciBwaXhlbFJhdGlvID0gKHR5cGVvZiB3aW5kb3cgPT09ICd1bmRlZmluZWQnID8gMSA6IHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvKTtcclxuICB2YXIgcHJvZmlsZSA9IGZhbHNlO1xyXG4gIHZhciBvbkRvbmUgPSBmdW5jdGlvbiAoZXJyKSB7XHJcbiAgICBpZiAoZXJyKSB7XHJcbiAgICAgIGNoZWNrJDEucmFpc2UoZXJyKTtcclxuICAgIH1cclxuICB9O1xyXG4gIHZhciBvbkRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7fTtcclxuICBpZiAodHlwZW9mIGFyZ3MgPT09ICdzdHJpbmcnKSB7XHJcbiAgICBjaGVjayQxKFxyXG4gICAgICB0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnLFxyXG4gICAgICAnc2VsZWN0b3IgcXVlcmllcyBvbmx5IHN1cHBvcnRlZCBpbiBET00gZW52aXJvbWVudHMnKTtcclxuICAgIGVsZW1lbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGFyZ3MpO1xyXG4gICAgY2hlY2skMShlbGVtZW50LCAnaW52YWxpZCBxdWVyeSBzdHJpbmcgZm9yIGVsZW1lbnQnKTtcclxuICB9IGVsc2UgaWYgKHR5cGVvZiBhcmdzID09PSAnb2JqZWN0Jykge1xyXG4gICAgaWYgKGlzSFRNTEVsZW1lbnQoYXJncykpIHtcclxuICAgICAgZWxlbWVudCA9IGFyZ3M7XHJcbiAgICB9IGVsc2UgaWYgKGlzV2ViR0xDb250ZXh0KGFyZ3MpKSB7XHJcbiAgICAgIGdsID0gYXJncztcclxuICAgICAgY2FudmFzID0gZ2wuY2FudmFzO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY2hlY2skMS5jb25zdHJ1Y3RvcihhcmdzKTtcclxuICAgICAgaWYgKCdnbCcgaW4gYXJncykge1xyXG4gICAgICAgIGdsID0gYXJncy5nbDtcclxuICAgICAgfSBlbHNlIGlmICgnY2FudmFzJyBpbiBhcmdzKSB7XHJcbiAgICAgICAgY2FudmFzID0gZ2V0RWxlbWVudChhcmdzLmNhbnZhcyk7XHJcbiAgICAgIH0gZWxzZSBpZiAoJ2NvbnRhaW5lcicgaW4gYXJncykge1xyXG4gICAgICAgIGNvbnRhaW5lciA9IGdldEVsZW1lbnQoYXJncy5jb250YWluZXIpO1xyXG4gICAgICB9XHJcbiAgICAgIGlmICgnYXR0cmlidXRlcycgaW4gYXJncykge1xyXG4gICAgICAgIGNvbnRleHRBdHRyaWJ1dGVzID0gYXJncy5hdHRyaWJ1dGVzO1xyXG4gICAgICAgIGNoZWNrJDEudHlwZShjb250ZXh0QXR0cmlidXRlcywgJ29iamVjdCcsICdpbnZhbGlkIGNvbnRleHQgYXR0cmlidXRlcycpO1xyXG4gICAgICB9XHJcbiAgICAgIGlmICgnZXh0ZW5zaW9ucycgaW4gYXJncykge1xyXG4gICAgICAgIGV4dGVuc2lvbnMgPSBwYXJzZUV4dGVuc2lvbnMoYXJncy5leHRlbnNpb25zKTtcclxuICAgICAgfVxyXG4gICAgICBpZiAoJ29wdGlvbmFsRXh0ZW5zaW9ucycgaW4gYXJncykge1xyXG4gICAgICAgIG9wdGlvbmFsRXh0ZW5zaW9ucyA9IHBhcnNlRXh0ZW5zaW9ucyhhcmdzLm9wdGlvbmFsRXh0ZW5zaW9ucyk7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKCdvbkRvbmUnIGluIGFyZ3MpIHtcclxuICAgICAgICBjaGVjayQxLnR5cGUoXHJcbiAgICAgICAgICBhcmdzLm9uRG9uZSwgJ2Z1bmN0aW9uJyxcclxuICAgICAgICAgICdpbnZhbGlkIG9yIG1pc3Npbmcgb25Eb25lIGNhbGxiYWNrJyk7XHJcbiAgICAgICAgb25Eb25lID0gYXJncy5vbkRvbmU7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKCdwcm9maWxlJyBpbiBhcmdzKSB7XHJcbiAgICAgICAgcHJvZmlsZSA9ICEhYXJncy5wcm9maWxlO1xyXG4gICAgICB9XHJcbiAgICAgIGlmICgncGl4ZWxSYXRpbycgaW4gYXJncykge1xyXG4gICAgICAgIHBpeGVsUmF0aW8gPSArYXJncy5waXhlbFJhdGlvO1xyXG4gICAgICAgIGNoZWNrJDEocGl4ZWxSYXRpbyA+IDAsICdpbnZhbGlkIHBpeGVsIHJhdGlvJyk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9IGVsc2Uge1xyXG4gICAgY2hlY2skMS5yYWlzZSgnaW52YWxpZCBhcmd1bWVudHMgdG8gcmVnbCcpO1xyXG4gIH1cclxuXHJcbiAgaWYgKGVsZW1lbnQpIHtcclxuICAgIGlmIChlbGVtZW50Lm5vZGVOYW1lLnRvTG93ZXJDYXNlKCkgPT09ICdjYW52YXMnKSB7XHJcbiAgICAgIGNhbnZhcyA9IGVsZW1lbnQ7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBjb250YWluZXIgPSBlbGVtZW50O1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgaWYgKCFnbCkge1xyXG4gICAgaWYgKCFjYW52YXMpIHtcclxuICAgICAgY2hlY2skMShcclxuICAgICAgICB0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnLFxyXG4gICAgICAgICdtdXN0IG1hbnVhbGx5IHNwZWNpZnkgd2ViZ2wgY29udGV4dCBvdXRzaWRlIG9mIERPTSBlbnZpcm9ubWVudHMnKTtcclxuICAgICAgdmFyIHJlc3VsdCA9IGNyZWF0ZUNhbnZhcyhjb250YWluZXIgfHwgZG9jdW1lbnQuYm9keSwgb25Eb25lLCBwaXhlbFJhdGlvKTtcclxuICAgICAgaWYgKCFyZXN1bHQpIHtcclxuICAgICAgICByZXR1cm4gbnVsbFxyXG4gICAgICB9XHJcbiAgICAgIGNhbnZhcyA9IHJlc3VsdC5jYW52YXM7XHJcbiAgICAgIG9uRGVzdHJveSA9IHJlc3VsdC5vbkRlc3Ryb3k7XHJcbiAgICB9XHJcbiAgICBnbCA9IGNyZWF0ZUNvbnRleHQoY2FudmFzLCBjb250ZXh0QXR0cmlidXRlcyk7XHJcbiAgfVxyXG5cclxuICBpZiAoIWdsKSB7XHJcbiAgICBvbkRlc3Ryb3koKTtcclxuICAgIG9uRG9uZSgnd2ViZ2wgbm90IHN1cHBvcnRlZCwgdHJ5IHVwZ3JhZGluZyB5b3VyIGJyb3dzZXIgb3IgZ3JhcGhpY3MgZHJpdmVycyBodHRwOi8vZ2V0LndlYmdsLm9yZycpO1xyXG4gICAgcmV0dXJuIG51bGxcclxuICB9XHJcblxyXG4gIHJldHVybiB7XHJcbiAgICBnbDogZ2wsXHJcbiAgICBjYW52YXM6IGNhbnZhcyxcclxuICAgIGNvbnRhaW5lcjogY29udGFpbmVyLFxyXG4gICAgZXh0ZW5zaW9uczogZXh0ZW5zaW9ucyxcclxuICAgIG9wdGlvbmFsRXh0ZW5zaW9uczogb3B0aW9uYWxFeHRlbnNpb25zLFxyXG4gICAgcGl4ZWxSYXRpbzogcGl4ZWxSYXRpbyxcclxuICAgIHByb2ZpbGU6IHByb2ZpbGUsXHJcbiAgICBvbkRvbmU6IG9uRG9uZSxcclxuICAgIG9uRGVzdHJveTogb25EZXN0cm95XHJcbiAgfVxyXG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUV4dGVuc2lvbkNhY2hlIChnbCwgY29uZmlnKSB7XHJcbiAgdmFyIGV4dGVuc2lvbnMgPSB7fTtcclxuXHJcbiAgZnVuY3Rpb24gdHJ5TG9hZEV4dGVuc2lvbiAobmFtZV8pIHtcclxuICAgIGNoZWNrJDEudHlwZShuYW1lXywgJ3N0cmluZycsICdleHRlbnNpb24gbmFtZSBtdXN0IGJlIHN0cmluZycpO1xyXG4gICAgdmFyIG5hbWUgPSBuYW1lXy50b0xvd2VyQ2FzZSgpO1xyXG4gICAgdmFyIGV4dDtcclxuICAgIHRyeSB7XHJcbiAgICAgIGV4dCA9IGV4dGVuc2lvbnNbbmFtZV0gPSBnbC5nZXRFeHRlbnNpb24obmFtZSk7XHJcbiAgICB9IGNhdGNoIChlKSB7fVxyXG4gICAgcmV0dXJuICEhZXh0XHJcbiAgfVxyXG5cclxuICBmb3IgKHZhciBpID0gMDsgaSA8IGNvbmZpZy5leHRlbnNpb25zLmxlbmd0aDsgKytpKSB7XHJcbiAgICB2YXIgbmFtZSA9IGNvbmZpZy5leHRlbnNpb25zW2ldO1xyXG4gICAgaWYgKCF0cnlMb2FkRXh0ZW5zaW9uKG5hbWUpKSB7XHJcbiAgICAgIGNvbmZpZy5vbkRlc3Ryb3koKTtcclxuICAgICAgY29uZmlnLm9uRG9uZSgnXCInICsgbmFtZSArICdcIiBleHRlbnNpb24gaXMgbm90IHN1cHBvcnRlZCBieSB0aGUgY3VycmVudCBXZWJHTCBjb250ZXh0LCB0cnkgdXBncmFkaW5nIHlvdXIgc3lzdGVtIG9yIGEgZGlmZmVyZW50IGJyb3dzZXInKTtcclxuICAgICAgcmV0dXJuIG51bGxcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGNvbmZpZy5vcHRpb25hbEV4dGVuc2lvbnMuZm9yRWFjaCh0cnlMb2FkRXh0ZW5zaW9uKTtcclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIGV4dGVuc2lvbnM6IGV4dGVuc2lvbnMsXHJcbiAgICByZXN0b3JlOiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgIE9iamVjdC5rZXlzKGV4dGVuc2lvbnMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcclxuICAgICAgICBpZiAoZXh0ZW5zaW9uc1tuYW1lXSAmJiAhdHJ5TG9hZEV4dGVuc2lvbihuYW1lKSkge1xyXG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCcocmVnbCk6IGVycm9yIHJlc3RvcmluZyBleHRlbnNpb24gJyArIG5hbWUpXHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuICAgIH1cclxuICB9XHJcbn1cblxuZnVuY3Rpb24gbG9vcCAobiwgZikge1xyXG4gIHZhciByZXN1bHQgPSBBcnJheShuKTtcclxuICBmb3IgKHZhciBpID0gMDsgaSA8IG47ICsraSkge1xyXG4gICAgcmVzdWx0W2ldID0gZihpKTtcclxuICB9XHJcbiAgcmV0dXJuIHJlc3VsdFxyXG59XG5cbnZhciBHTF9CWVRFJDEgPSA1MTIwO1xyXG52YXIgR0xfVU5TSUdORURfQllURSQyID0gNTEyMTtcclxudmFyIEdMX1NIT1JUJDEgPSA1MTIyO1xyXG52YXIgR0xfVU5TSUdORURfU0hPUlQkMSA9IDUxMjM7XHJcbnZhciBHTF9JTlQkMSA9IDUxMjQ7XHJcbnZhciBHTF9VTlNJR05FRF9JTlQkMSA9IDUxMjU7XHJcbnZhciBHTF9GTE9BVCQyID0gNTEyNjtcclxuXHJcbmZ1bmN0aW9uIG5leHRQb3cxNiAodikge1xyXG4gIGZvciAodmFyIGkgPSAxNjsgaSA8PSAoMSA8PCAyOCk7IGkgKj0gMTYpIHtcclxuICAgIGlmICh2IDw9IGkpIHtcclxuICAgICAgcmV0dXJuIGlcclxuICAgIH1cclxuICB9XHJcbiAgcmV0dXJuIDBcclxufVxyXG5cclxuZnVuY3Rpb24gbG9nMiAodikge1xyXG4gIHZhciByLCBzaGlmdDtcclxuICByID0gKHYgPiAweEZGRkYpIDw8IDQ7XHJcbiAgdiA+Pj49IHI7XHJcbiAgc2hpZnQgPSAodiA+IDB4RkYpIDw8IDM7XHJcbiAgdiA+Pj49IHNoaWZ0OyByIHw9IHNoaWZ0O1xyXG4gIHNoaWZ0ID0gKHYgPiAweEYpIDw8IDI7XHJcbiAgdiA+Pj49IHNoaWZ0OyByIHw9IHNoaWZ0O1xyXG4gIHNoaWZ0ID0gKHYgPiAweDMpIDw8IDE7XHJcbiAgdiA+Pj49IHNoaWZ0OyByIHw9IHNoaWZ0O1xyXG4gIHJldHVybiByIHwgKHYgPj4gMSlcclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlUG9vbCAoKSB7XHJcbiAgdmFyIGJ1ZmZlclBvb2wgPSBsb29wKDgsIGZ1bmN0aW9uICgpIHtcclxuICAgIHJldHVybiBbXVxyXG4gIH0pO1xyXG5cclxuICBmdW5jdGlvbiBhbGxvYyAobikge1xyXG4gICAgdmFyIHN6ID0gbmV4dFBvdzE2KG4pO1xyXG4gICAgdmFyIGJpbiA9IGJ1ZmZlclBvb2xbbG9nMihzeikgPj4gMl07XHJcbiAgICBpZiAoYmluLmxlbmd0aCA+IDApIHtcclxuICAgICAgcmV0dXJuIGJpbi5wb3AoKVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIG5ldyBBcnJheUJ1ZmZlcihzeilcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGZyZWUgKGJ1Zikge1xyXG4gICAgYnVmZmVyUG9vbFtsb2cyKGJ1Zi5ieXRlTGVuZ3RoKSA+PiAyXS5wdXNoKGJ1Zik7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBhbGxvY1R5cGUgKHR5cGUsIG4pIHtcclxuICAgIHZhciByZXN1bHQgPSBudWxsO1xyXG4gICAgc3dpdGNoICh0eXBlKSB7XHJcbiAgICAgIGNhc2UgR0xfQllURSQxOlxyXG4gICAgICAgIHJlc3VsdCA9IG5ldyBJbnQ4QXJyYXkoYWxsb2MobiksIDAsIG4pO1xyXG4gICAgICAgIGJyZWFrXHJcbiAgICAgIGNhc2UgR0xfVU5TSUdORURfQllURSQyOlxyXG4gICAgICAgIHJlc3VsdCA9IG5ldyBVaW50OEFycmF5KGFsbG9jKG4pLCAwLCBuKTtcclxuICAgICAgICBicmVha1xyXG4gICAgICBjYXNlIEdMX1NIT1JUJDE6XHJcbiAgICAgICAgcmVzdWx0ID0gbmV3IEludDE2QXJyYXkoYWxsb2MoMiAqIG4pLCAwLCBuKTtcclxuICAgICAgICBicmVha1xyXG4gICAgICBjYXNlIEdMX1VOU0lHTkVEX1NIT1JUJDE6XHJcbiAgICAgICAgcmVzdWx0ID0gbmV3IFVpbnQxNkFycmF5KGFsbG9jKDIgKiBuKSwgMCwgbik7XHJcbiAgICAgICAgYnJlYWtcclxuICAgICAgY2FzZSBHTF9JTlQkMTpcclxuICAgICAgICByZXN1bHQgPSBuZXcgSW50MzJBcnJheShhbGxvYyg0ICogbiksIDAsIG4pO1xyXG4gICAgICAgIGJyZWFrXHJcbiAgICAgIGNhc2UgR0xfVU5TSUdORURfSU5UJDE6XHJcbiAgICAgICAgcmVzdWx0ID0gbmV3IFVpbnQzMkFycmF5KGFsbG9jKDQgKiBuKSwgMCwgbik7XHJcbiAgICAgICAgYnJlYWtcclxuICAgICAgY2FzZSBHTF9GTE9BVCQyOlxyXG4gICAgICAgIHJlc3VsdCA9IG5ldyBGbG9hdDMyQXJyYXkoYWxsb2MoNCAqIG4pLCAwLCBuKTtcclxuICAgICAgICBicmVha1xyXG4gICAgICBkZWZhdWx0OlxyXG4gICAgICAgIHJldHVybiBudWxsXHJcbiAgICB9XHJcbiAgICBpZiAocmVzdWx0Lmxlbmd0aCAhPT0gbikge1xyXG4gICAgICByZXR1cm4gcmVzdWx0LnN1YmFycmF5KDAsIG4pXHJcbiAgICB9XHJcbiAgICByZXR1cm4gcmVzdWx0XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBmcmVlVHlwZSAoYXJyYXkpIHtcclxuICAgIGZyZWUoYXJyYXkuYnVmZmVyKTtcclxuICB9XHJcblxyXG4gIHJldHVybiB7XHJcbiAgICBhbGxvYzogYWxsb2MsXHJcbiAgICBmcmVlOiBmcmVlLFxyXG4gICAgYWxsb2NUeXBlOiBhbGxvY1R5cGUsXHJcbiAgICBmcmVlVHlwZTogZnJlZVR5cGVcclxuICB9XHJcbn1cclxuXHJcbnZhciBwb29sID0gY3JlYXRlUG9vbCgpO1xyXG5cclxuLy8gemVybyBwb29sIGZvciBpbml0aWFsIHplcm8gZGF0YVxyXG5wb29sLnplcm8gPSBjcmVhdGVQb29sKCk7XG5cbnZhciBHTF9TVUJQSVhFTF9CSVRTID0gMHgwRDUwO1xyXG52YXIgR0xfUkVEX0JJVFMgPSAweDBENTI7XHJcbnZhciBHTF9HUkVFTl9CSVRTID0gMHgwRDUzO1xyXG52YXIgR0xfQkxVRV9CSVRTID0gMHgwRDU0O1xyXG52YXIgR0xfQUxQSEFfQklUUyA9IDB4MEQ1NTtcclxudmFyIEdMX0RFUFRIX0JJVFMgPSAweDBENTY7XHJcbnZhciBHTF9TVEVOQ0lMX0JJVFMgPSAweDBENTc7XHJcblxyXG52YXIgR0xfQUxJQVNFRF9QT0lOVF9TSVpFX1JBTkdFID0gMHg4NDZEO1xyXG52YXIgR0xfQUxJQVNFRF9MSU5FX1dJRFRIX1JBTkdFID0gMHg4NDZFO1xyXG5cclxudmFyIEdMX01BWF9URVhUVVJFX1NJWkUgPSAweDBEMzM7XHJcbnZhciBHTF9NQVhfVklFV1BPUlRfRElNUyA9IDB4MEQzQTtcclxudmFyIEdMX01BWF9WRVJURVhfQVRUUklCUyA9IDB4ODg2OTtcclxudmFyIEdMX01BWF9WRVJURVhfVU5JRk9STV9WRUNUT1JTID0gMHg4REZCO1xyXG52YXIgR0xfTUFYX1ZBUllJTkdfVkVDVE9SUyA9IDB4OERGQztcclxudmFyIEdMX01BWF9DT01CSU5FRF9URVhUVVJFX0lNQUdFX1VOSVRTID0gMHg4QjREO1xyXG52YXIgR0xfTUFYX1ZFUlRFWF9URVhUVVJFX0lNQUdFX1VOSVRTID0gMHg4QjRDO1xyXG52YXIgR0xfTUFYX1RFWFRVUkVfSU1BR0VfVU5JVFMgPSAweDg4NzI7XHJcbnZhciBHTF9NQVhfRlJBR01FTlRfVU5JRk9STV9WRUNUT1JTID0gMHg4REZEO1xyXG52YXIgR0xfTUFYX0NVQkVfTUFQX1RFWFRVUkVfU0laRSA9IDB4ODUxQztcclxudmFyIEdMX01BWF9SRU5ERVJCVUZGRVJfU0laRSA9IDB4ODRFODtcclxuXHJcbnZhciBHTF9WRU5ET1IgPSAweDFGMDA7XHJcbnZhciBHTF9SRU5ERVJFUiA9IDB4MUYwMTtcclxudmFyIEdMX1ZFUlNJT04gPSAweDFGMDI7XHJcbnZhciBHTF9TSEFESU5HX0xBTkdVQUdFX1ZFUlNJT04gPSAweDhCOEM7XHJcblxyXG52YXIgR0xfTUFYX1RFWFRVUkVfTUFYX0FOSVNPVFJPUFlfRVhUID0gMHg4NEZGO1xyXG5cclxudmFyIEdMX01BWF9DT0xPUl9BVFRBQ0hNRU5UU19XRUJHTCA9IDB4OENERjtcclxudmFyIEdMX01BWF9EUkFXX0JVRkZFUlNfV0VCR0wgPSAweDg4MjQ7XHJcblxyXG52YXIgR0xfVEVYVFVSRV8yRCA9IDB4MERFMTtcclxudmFyIEdMX1RFWFRVUkVfQ1VCRV9NQVAgPSAweDg1MTM7XHJcbnZhciBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1ggPSAweDg1MTU7XHJcbnZhciBHTF9URVhUVVJFMCA9IDB4ODRDMDtcclxudmFyIEdMX1JHQkEgPSAweDE5MDg7XHJcbnZhciBHTF9GTE9BVCQxID0gMHgxNDA2O1xyXG52YXIgR0xfVU5TSUdORURfQllURSQxID0gMHgxNDAxO1xyXG52YXIgR0xfRlJBTUVCVUZGRVIgPSAweDhENDA7XHJcbnZhciBHTF9GUkFNRUJVRkZFUl9DT01QTEVURSA9IDB4OENENTtcclxudmFyIEdMX0NPTE9SX0FUVEFDSE1FTlQwID0gMHg4Q0UwO1xyXG52YXIgR0xfQ09MT1JfQlVGRkVSX0JJVCQxID0gMHg0MDAwO1xyXG5cclxudmFyIHdyYXBMaW1pdHMgPSBmdW5jdGlvbiAoZ2wsIGV4dGVuc2lvbnMpIHtcclxuICB2YXIgbWF4QW5pc290cm9waWMgPSAxO1xyXG4gIGlmIChleHRlbnNpb25zLmV4dF90ZXh0dXJlX2ZpbHRlcl9hbmlzb3Ryb3BpYykge1xyXG4gICAgbWF4QW5pc290cm9waWMgPSBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1RFWFRVUkVfTUFYX0FOSVNPVFJPUFlfRVhUKTtcclxuICB9XHJcblxyXG4gIHZhciBtYXhEcmF3YnVmZmVycyA9IDE7XHJcbiAgdmFyIG1heENvbG9yQXR0YWNobWVudHMgPSAxO1xyXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2RyYXdfYnVmZmVycykge1xyXG4gICAgbWF4RHJhd2J1ZmZlcnMgPSBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0RSQVdfQlVGRkVSU19XRUJHTCk7XHJcbiAgICBtYXhDb2xvckF0dGFjaG1lbnRzID0gZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9DT0xPUl9BVFRBQ0hNRU5UU19XRUJHTCk7XHJcbiAgfVxyXG5cclxuICAvLyBkZXRlY3QgaWYgcmVhZGluZyBmbG9hdCB0ZXh0dXJlcyBpcyBhdmFpbGFibGUgKFNhZmFyaSBkb2Vzbid0IHN1cHBvcnQpXHJcbiAgdmFyIHJlYWRGbG9hdCA9ICEhZXh0ZW5zaW9ucy5vZXNfdGV4dHVyZV9mbG9hdDtcclxuICBpZiAocmVhZEZsb2F0KSB7XHJcbiAgICB2YXIgcmVhZEZsb2F0VGV4dHVyZSA9IGdsLmNyZWF0ZVRleHR1cmUoKTtcclxuICAgIGdsLmJpbmRUZXh0dXJlKEdMX1RFWFRVUkVfMkQsIHJlYWRGbG9hdFRleHR1cmUpO1xyXG4gICAgZ2wudGV4SW1hZ2UyRChHTF9URVhUVVJFXzJELCAwLCBHTF9SR0JBLCAxLCAxLCAwLCBHTF9SR0JBLCBHTF9GTE9BVCQxLCBudWxsKTtcclxuXHJcbiAgICB2YXIgZmJvID0gZ2wuY3JlYXRlRnJhbWVidWZmZXIoKTtcclxuICAgIGdsLmJpbmRGcmFtZWJ1ZmZlcihHTF9GUkFNRUJVRkZFUiwgZmJvKTtcclxuICAgIGdsLmZyYW1lYnVmZmVyVGV4dHVyZTJEKEdMX0ZSQU1FQlVGRkVSLCBHTF9DT0xPUl9BVFRBQ0hNRU5UMCwgR0xfVEVYVFVSRV8yRCwgcmVhZEZsb2F0VGV4dHVyZSwgMCk7XHJcbiAgICBnbC5iaW5kVGV4dHVyZShHTF9URVhUVVJFXzJELCBudWxsKTtcclxuXHJcbiAgICBpZiAoZ2wuY2hlY2tGcmFtZWJ1ZmZlclN0YXR1cyhHTF9GUkFNRUJVRkZFUikgIT09IEdMX0ZSQU1FQlVGRkVSX0NPTVBMRVRFKSByZWFkRmxvYXQgPSBmYWxzZTtcclxuXHJcbiAgICBlbHNlIHtcclxuICAgICAgZ2wudmlld3BvcnQoMCwgMCwgMSwgMSk7XHJcbiAgICAgIGdsLmNsZWFyQ29sb3IoMS4wLCAwLjAsIDAuMCwgMS4wKTtcclxuICAgICAgZ2wuY2xlYXIoR0xfQ09MT1JfQlVGRkVSX0JJVCQxKTtcclxuICAgICAgdmFyIHBpeGVscyA9IHBvb2wuYWxsb2NUeXBlKEdMX0ZMT0FUJDEsIDQpO1xyXG4gICAgICBnbC5yZWFkUGl4ZWxzKDAsIDAsIDEsIDEsIEdMX1JHQkEsIEdMX0ZMT0FUJDEsIHBpeGVscyk7XHJcblxyXG4gICAgICBpZiAoZ2wuZ2V0RXJyb3IoKSkgcmVhZEZsb2F0ID0gZmFsc2U7XHJcbiAgICAgIGVsc2Uge1xyXG4gICAgICAgIGdsLmRlbGV0ZUZyYW1lYnVmZmVyKGZibyk7XHJcbiAgICAgICAgZ2wuZGVsZXRlVGV4dHVyZShyZWFkRmxvYXRUZXh0dXJlKTtcclxuXHJcbiAgICAgICAgcmVhZEZsb2F0ID0gcGl4ZWxzWzBdID09PSAxLjA7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHBvb2wuZnJlZVR5cGUocGl4ZWxzKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8vIGRldGVjdCBub24gcG93ZXIgb2YgdHdvIGN1YmUgdGV4dHVyZXMgc3VwcG9ydCAoSUUgZG9lc24ndCBzdXBwb3J0KVxyXG4gIHZhciBpc0lFID0gdHlwZW9mIG5hdmlnYXRvciAhPT0gJ3VuZGVmaW5lZCcgJiYgKC9NU0lFLy50ZXN0KG5hdmlnYXRvci51c2VyQWdlbnQpIHx8IC9UcmlkZW50XFwvLy50ZXN0KG5hdmlnYXRvci5hcHBWZXJzaW9uKSB8fCAvRWRnZS8udGVzdChuYXZpZ2F0b3IudXNlckFnZW50KSk7XHJcblxyXG4gIHZhciBucG90VGV4dHVyZUN1YmUgPSB0cnVlO1xyXG5cclxuICBpZiAoIWlzSUUpIHtcclxuICAgIHZhciBjdWJlVGV4dHVyZSA9IGdsLmNyZWF0ZVRleHR1cmUoKTtcclxuICAgIHZhciBkYXRhID0gcG9vbC5hbGxvY1R5cGUoR0xfVU5TSUdORURfQllURSQxLCAzNik7XHJcbiAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwKTtcclxuICAgIGdsLmJpbmRUZXh0dXJlKEdMX1RFWFRVUkVfQ1VCRV9NQVAsIGN1YmVUZXh0dXJlKTtcclxuICAgIGdsLnRleEltYWdlMkQoR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YLCAwLCBHTF9SR0JBLCAzLCAzLCAwLCBHTF9SR0JBLCBHTF9VTlNJR05FRF9CWVRFJDEsIGRhdGEpO1xyXG4gICAgcG9vbC5mcmVlVHlwZShkYXRhKTtcclxuICAgIGdsLmJpbmRUZXh0dXJlKEdMX1RFWFRVUkVfQ1VCRV9NQVAsIG51bGwpO1xyXG4gICAgZ2wuZGVsZXRlVGV4dHVyZShjdWJlVGV4dHVyZSk7XHJcbiAgICBucG90VGV4dHVyZUN1YmUgPSAhZ2wuZ2V0RXJyb3IoKTtcclxuICB9XHJcblxyXG4gIHJldHVybiB7XHJcbiAgICAvLyBkcmF3aW5nIGJ1ZmZlciBiaXQgZGVwdGhcclxuICAgIGNvbG9yQml0czogW1xyXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfUkVEX0JJVFMpLFxyXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfR1JFRU5fQklUUyksXHJcbiAgICAgIGdsLmdldFBhcmFtZXRlcihHTF9CTFVFX0JJVFMpLFxyXG4gICAgICBnbC5nZXRQYXJhbWV0ZXIoR0xfQUxQSEFfQklUUylcclxuICAgIF0sXHJcbiAgICBkZXB0aEJpdHM6IGdsLmdldFBhcmFtZXRlcihHTF9ERVBUSF9CSVRTKSxcclxuICAgIHN0ZW5jaWxCaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfU1RFTkNJTF9CSVRTKSxcclxuICAgIHN1YnBpeGVsQml0czogZ2wuZ2V0UGFyYW1ldGVyKEdMX1NVQlBJWEVMX0JJVFMpLFxyXG5cclxuICAgIC8vIHN1cHBvcnRlZCBleHRlbnNpb25zXHJcbiAgICBleHRlbnNpb25zOiBPYmplY3Qua2V5cyhleHRlbnNpb25zKS5maWx0ZXIoZnVuY3Rpb24gKGV4dCkge1xyXG4gICAgICByZXR1cm4gISFleHRlbnNpb25zW2V4dF1cclxuICAgIH0pLFxyXG5cclxuICAgIC8vIG1heCBhbmlzbyBzYW1wbGVzXHJcbiAgICBtYXhBbmlzb3Ryb3BpYzogbWF4QW5pc290cm9waWMsXHJcblxyXG4gICAgLy8gbWF4IGRyYXcgYnVmZmVyc1xyXG4gICAgbWF4RHJhd2J1ZmZlcnM6IG1heERyYXdidWZmZXJzLFxyXG4gICAgbWF4Q29sb3JBdHRhY2htZW50czogbWF4Q29sb3JBdHRhY2htZW50cyxcclxuXHJcbiAgICAvLyBwb2ludCBhbmQgbGluZSBzaXplIHJhbmdlc1xyXG4gICAgcG9pbnRTaXplRGltczogZ2wuZ2V0UGFyYW1ldGVyKEdMX0FMSUFTRURfUE9JTlRfU0laRV9SQU5HRSksXHJcbiAgICBsaW5lV2lkdGhEaW1zOiBnbC5nZXRQYXJhbWV0ZXIoR0xfQUxJQVNFRF9MSU5FX1dJRFRIX1JBTkdFKSxcclxuICAgIG1heFZpZXdwb3J0RGltczogZ2wuZ2V0UGFyYW1ldGVyKEdMX01BWF9WSUVXUE9SVF9ESU1TKSxcclxuICAgIG1heENvbWJpbmVkVGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX0NPTUJJTkVEX1RFWFRVUkVfSU1BR0VfVU5JVFMpLFxyXG4gICAgbWF4Q3ViZU1hcFNpemU6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfQ1VCRV9NQVBfVEVYVFVSRV9TSVpFKSxcclxuICAgIG1heFJlbmRlcmJ1ZmZlclNpemU6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfUkVOREVSQlVGRkVSX1NJWkUpLFxyXG4gICAgbWF4VGV4dHVyZVVuaXRzOiBnbC5nZXRQYXJhbWV0ZXIoR0xfTUFYX1RFWFRVUkVfSU1BR0VfVU5JVFMpLFxyXG4gICAgbWF4VGV4dHVyZVNpemU6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVEVYVFVSRV9TSVpFKSxcclxuICAgIG1heEF0dHJpYnV0ZXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVkVSVEVYX0FUVFJJQlMpLFxyXG4gICAgbWF4VmVydGV4VW5pZm9ybXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVkVSVEVYX1VOSUZPUk1fVkVDVE9SUyksXHJcbiAgICBtYXhWZXJ0ZXhUZXh0dXJlVW5pdHM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVkVSVEVYX1RFWFRVUkVfSU1BR0VfVU5JVFMpLFxyXG4gICAgbWF4VmFyeWluZ1ZlY3RvcnM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfVkFSWUlOR19WRUNUT1JTKSxcclxuICAgIG1heEZyYWdtZW50VW5pZm9ybXM6IGdsLmdldFBhcmFtZXRlcihHTF9NQVhfRlJBR01FTlRfVU5JRk9STV9WRUNUT1JTKSxcclxuXHJcbiAgICAvLyB2ZW5kb3IgaW5mb1xyXG4gICAgZ2xzbDogZ2wuZ2V0UGFyYW1ldGVyKEdMX1NIQURJTkdfTEFOR1VBR0VfVkVSU0lPTiksXHJcbiAgICByZW5kZXJlcjogZ2wuZ2V0UGFyYW1ldGVyKEdMX1JFTkRFUkVSKSxcclxuICAgIHZlbmRvcjogZ2wuZ2V0UGFyYW1ldGVyKEdMX1ZFTkRPUiksXHJcbiAgICB2ZXJzaW9uOiBnbC5nZXRQYXJhbWV0ZXIoR0xfVkVSU0lPTiksXHJcblxyXG4gICAgLy8gcXVpcmtzXHJcbiAgICByZWFkRmxvYXQ6IHJlYWRGbG9hdCxcclxuICAgIG5wb3RUZXh0dXJlQ3ViZTogbnBvdFRleHR1cmVDdWJlXHJcbiAgfVxyXG59O1xuXG5mdW5jdGlvbiBpc05EQXJyYXlMaWtlIChvYmopIHtcclxuICByZXR1cm4gKFxyXG4gICAgISFvYmogJiZcclxuICAgIHR5cGVvZiBvYmogPT09ICdvYmplY3QnICYmXHJcbiAgICBBcnJheS5pc0FycmF5KG9iai5zaGFwZSkgJiZcclxuICAgIEFycmF5LmlzQXJyYXkob2JqLnN0cmlkZSkgJiZcclxuICAgIHR5cGVvZiBvYmoub2Zmc2V0ID09PSAnbnVtYmVyJyAmJlxyXG4gICAgb2JqLnNoYXBlLmxlbmd0aCA9PT0gb2JqLnN0cmlkZS5sZW5ndGggJiZcclxuICAgIChBcnJheS5pc0FycmF5KG9iai5kYXRhKSB8fFxyXG4gICAgICBpc1R5cGVkQXJyYXkob2JqLmRhdGEpKSlcclxufVxuXG52YXIgdmFsdWVzID0gZnVuY3Rpb24gKG9iaikge1xyXG4gIHJldHVybiBPYmplY3Qua2V5cyhvYmopLm1hcChmdW5jdGlvbiAoa2V5KSB7IHJldHVybiBvYmpba2V5XSB9KVxyXG59O1xuXG52YXIgZmxhdHRlblV0aWxzID0ge1xyXG4gIHNoYXBlOiBhcnJheVNoYXBlJDEsXHJcbiAgZmxhdHRlbjogZmxhdHRlbkFycmF5XHJcbn07XHJcblxyXG5mdW5jdGlvbiBmbGF0dGVuMUQgKGFycmF5LCBueCwgb3V0KSB7XHJcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBueDsgKytpKSB7XHJcbiAgICBvdXRbaV0gPSBhcnJheVtpXTtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGZsYXR0ZW4yRCAoYXJyYXksIG54LCBueSwgb3V0KSB7XHJcbiAgdmFyIHB0ciA9IDA7XHJcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBueDsgKytpKSB7XHJcbiAgICB2YXIgcm93ID0gYXJyYXlbaV07XHJcbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IG55OyArK2opIHtcclxuICAgICAgb3V0W3B0cisrXSA9IHJvd1tqXTtcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGZsYXR0ZW4zRCAoYXJyYXksIG54LCBueSwgbnosIG91dCwgcHRyXykge1xyXG4gIHZhciBwdHIgPSBwdHJfO1xyXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbng7ICsraSkge1xyXG4gICAgdmFyIHJvdyA9IGFycmF5W2ldO1xyXG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBueTsgKytqKSB7XHJcbiAgICAgIHZhciBjb2wgPSByb3dbal07XHJcbiAgICAgIGZvciAodmFyIGsgPSAwOyBrIDwgbno7ICsraykge1xyXG4gICAgICAgIG91dFtwdHIrK10gPSBjb2xba107XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGZsYXR0ZW5SZWMgKGFycmF5LCBzaGFwZSwgbGV2ZWwsIG91dCwgcHRyKSB7XHJcbiAgdmFyIHN0cmlkZSA9IDE7XHJcbiAgZm9yICh2YXIgaSA9IGxldmVsICsgMTsgaSA8IHNoYXBlLmxlbmd0aDsgKytpKSB7XHJcbiAgICBzdHJpZGUgKj0gc2hhcGVbaV07XHJcbiAgfVxyXG4gIHZhciBuID0gc2hhcGVbbGV2ZWxdO1xyXG4gIGlmIChzaGFwZS5sZW5ndGggLSBsZXZlbCA9PT0gNCkge1xyXG4gICAgdmFyIG54ID0gc2hhcGVbbGV2ZWwgKyAxXTtcclxuICAgIHZhciBueSA9IHNoYXBlW2xldmVsICsgMl07XHJcbiAgICB2YXIgbnogPSBzaGFwZVtsZXZlbCArIDNdO1xyXG4gICAgZm9yIChpID0gMDsgaSA8IG47ICsraSkge1xyXG4gICAgICBmbGF0dGVuM0QoYXJyYXlbaV0sIG54LCBueSwgbnosIG91dCwgcHRyKTtcclxuICAgICAgcHRyICs9IHN0cmlkZTtcclxuICAgIH1cclxuICB9IGVsc2Uge1xyXG4gICAgZm9yIChpID0gMDsgaSA8IG47ICsraSkge1xyXG4gICAgICBmbGF0dGVuUmVjKGFycmF5W2ldLCBzaGFwZSwgbGV2ZWwgKyAxLCBvdXQsIHB0cik7XHJcbiAgICAgIHB0ciArPSBzdHJpZGU7XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBmbGF0dGVuQXJyYXkgKGFycmF5LCBzaGFwZSwgdHlwZSwgb3V0Xykge1xyXG4gIHZhciBzeiA9IDE7XHJcbiAgaWYgKHNoYXBlLmxlbmd0aCkge1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzaGFwZS5sZW5ndGg7ICsraSkge1xyXG4gICAgICBzeiAqPSBzaGFwZVtpXTtcclxuICAgIH1cclxuICB9IGVsc2Uge1xyXG4gICAgc3ogPSAwO1xyXG4gIH1cclxuICB2YXIgb3V0ID0gb3V0XyB8fCBwb29sLmFsbG9jVHlwZSh0eXBlLCBzeik7XHJcbiAgc3dpdGNoIChzaGFwZS5sZW5ndGgpIHtcclxuICAgIGNhc2UgMDpcclxuICAgICAgYnJlYWtcclxuICAgIGNhc2UgMTpcclxuICAgICAgZmxhdHRlbjFEKGFycmF5LCBzaGFwZVswXSwgb3V0KTtcclxuICAgICAgYnJlYWtcclxuICAgIGNhc2UgMjpcclxuICAgICAgZmxhdHRlbjJEKGFycmF5LCBzaGFwZVswXSwgc2hhcGVbMV0sIG91dCk7XHJcbiAgICAgIGJyZWFrXHJcbiAgICBjYXNlIDM6XHJcbiAgICAgIGZsYXR0ZW4zRChhcnJheSwgc2hhcGVbMF0sIHNoYXBlWzFdLCBzaGFwZVsyXSwgb3V0LCAwKTtcclxuICAgICAgYnJlYWtcclxuICAgIGRlZmF1bHQ6XHJcbiAgICAgIGZsYXR0ZW5SZWMoYXJyYXksIHNoYXBlLCAwLCBvdXQsIDApO1xyXG4gIH1cclxuICByZXR1cm4gb3V0XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFycmF5U2hhcGUkMSAoYXJyYXlfKSB7XHJcbiAgdmFyIHNoYXBlID0gW107XHJcbiAgZm9yICh2YXIgYXJyYXkgPSBhcnJheV87IGFycmF5Lmxlbmd0aDsgYXJyYXkgPSBhcnJheVswXSkge1xyXG4gICAgc2hhcGUucHVzaChhcnJheS5sZW5ndGgpO1xyXG4gIH1cclxuICByZXR1cm4gc2hhcGVcclxufVxuXG52YXIgYXJyYXlUeXBlcyA9IHtcblx0XCJbb2JqZWN0IEludDhBcnJheV1cIjogNTEyMCxcblx0XCJbb2JqZWN0IEludDE2QXJyYXldXCI6IDUxMjIsXG5cdFwiW29iamVjdCBJbnQzMkFycmF5XVwiOiA1MTI0LFxuXHRcIltvYmplY3QgVWludDhBcnJheV1cIjogNTEyMSxcblx0XCJbb2JqZWN0IFVpbnQ4Q2xhbXBlZEFycmF5XVwiOiA1MTIxLFxuXHRcIltvYmplY3QgVWludDE2QXJyYXldXCI6IDUxMjMsXG5cdFwiW29iamVjdCBVaW50MzJBcnJheV1cIjogNTEyNSxcblx0XCJbb2JqZWN0IEZsb2F0MzJBcnJheV1cIjogNTEyNixcblx0XCJbb2JqZWN0IEZsb2F0NjRBcnJheV1cIjogNTEyMSxcblx0XCJbb2JqZWN0IEFycmF5QnVmZmVyXVwiOiA1MTIxXG59O1xuXG52YXIgaW50OCA9IDUxMjA7XG52YXIgaW50MTYgPSA1MTIyO1xudmFyIGludDMyID0gNTEyNDtcbnZhciB1aW50OCA9IDUxMjE7XG52YXIgdWludDE2ID0gNTEyMztcbnZhciB1aW50MzIgPSA1MTI1O1xudmFyIGZsb2F0ID0gNTEyNjtcbnZhciBmbG9hdDMyID0gNTEyNjtcbnZhciBnbFR5cGVzID0ge1xuXHRpbnQ4OiBpbnQ4LFxuXHRpbnQxNjogaW50MTYsXG5cdGludDMyOiBpbnQzMixcblx0dWludDg6IHVpbnQ4LFxuXHR1aW50MTY6IHVpbnQxNixcblx0dWludDMyOiB1aW50MzIsXG5cdGZsb2F0OiBmbG9hdCxcblx0ZmxvYXQzMjogZmxvYXQzMlxufTtcblxudmFyIGR5bmFtaWMkMSA9IDM1MDQ4O1xudmFyIHN0cmVhbSA9IDM1MDQwO1xudmFyIHVzYWdlVHlwZXMgPSB7XG5cdGR5bmFtaWM6IGR5bmFtaWMkMSxcblx0c3RyZWFtOiBzdHJlYW0sXG5cdFwic3RhdGljXCI6IDM1MDQ0XG59O1xuXG52YXIgYXJyYXlGbGF0dGVuID0gZmxhdHRlblV0aWxzLmZsYXR0ZW47XHJcbnZhciBhcnJheVNoYXBlID0gZmxhdHRlblV0aWxzLnNoYXBlO1xyXG5cclxudmFyIEdMX1NUQVRJQ19EUkFXID0gMHg4OEU0O1xyXG52YXIgR0xfU1RSRUFNX0RSQVcgPSAweDg4RTA7XHJcblxyXG52YXIgR0xfVU5TSUdORURfQllURSQzID0gNTEyMTtcclxudmFyIEdMX0ZMT0FUJDMgPSA1MTI2O1xyXG5cclxudmFyIERUWVBFU19TSVpFUyA9IFtdO1xyXG5EVFlQRVNfU0laRVNbNTEyMF0gPSAxOyAvLyBpbnQ4XHJcbkRUWVBFU19TSVpFU1s1MTIyXSA9IDI7IC8vIGludDE2XHJcbkRUWVBFU19TSVpFU1s1MTI0XSA9IDQ7IC8vIGludDMyXHJcbkRUWVBFU19TSVpFU1s1MTIxXSA9IDE7IC8vIHVpbnQ4XHJcbkRUWVBFU19TSVpFU1s1MTIzXSA9IDI7IC8vIHVpbnQxNlxyXG5EVFlQRVNfU0laRVNbNTEyNV0gPSA0OyAvLyB1aW50MzJcclxuRFRZUEVTX1NJWkVTWzUxMjZdID0gNDsgLy8gZmxvYXQzMlxyXG5cclxuZnVuY3Rpb24gdHlwZWRBcnJheUNvZGUgKGRhdGEpIHtcclxuICByZXR1cm4gYXJyYXlUeXBlc1tPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoZGF0YSldIHwgMFxyXG59XHJcblxyXG5mdW5jdGlvbiBjb3B5QXJyYXkgKG91dCwgaW5wKSB7XHJcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBpbnAubGVuZ3RoOyArK2kpIHtcclxuICAgIG91dFtpXSA9IGlucFtpXTtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHRyYW5zcG9zZSAoXHJcbiAgcmVzdWx0LCBkYXRhLCBzaGFwZVgsIHNoYXBlWSwgc3RyaWRlWCwgc3RyaWRlWSwgb2Zmc2V0KSB7XHJcbiAgdmFyIHB0ciA9IDA7XHJcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzaGFwZVg7ICsraSkge1xyXG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBzaGFwZVk7ICsraikge1xyXG4gICAgICByZXN1bHRbcHRyKytdID0gZGF0YVtzdHJpZGVYICogaSArIHN0cmlkZVkgKiBqICsgb2Zmc2V0XTtcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHdyYXBCdWZmZXJTdGF0ZSAoZ2wsIHN0YXRzLCBjb25maWcsIGF0dHJpYnV0ZVN0YXRlKSB7XHJcbiAgdmFyIGJ1ZmZlckNvdW50ID0gMDtcclxuICB2YXIgYnVmZmVyU2V0ID0ge307XHJcblxyXG4gIGZ1bmN0aW9uIFJFR0xCdWZmZXIgKHR5cGUpIHtcclxuICAgIHRoaXMuaWQgPSBidWZmZXJDb3VudCsrO1xyXG4gICAgdGhpcy5idWZmZXIgPSBnbC5jcmVhdGVCdWZmZXIoKTtcclxuICAgIHRoaXMudHlwZSA9IHR5cGU7XHJcbiAgICB0aGlzLnVzYWdlID0gR0xfU1RBVElDX0RSQVc7XHJcbiAgICB0aGlzLmJ5dGVMZW5ndGggPSAwO1xyXG4gICAgdGhpcy5kaW1lbnNpb24gPSAxO1xyXG4gICAgdGhpcy5kdHlwZSA9IEdMX1VOU0lHTkVEX0JZVEUkMztcclxuXHJcbiAgICB0aGlzLnBlcnNpc3RlbnREYXRhID0gbnVsbDtcclxuXHJcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcclxuICAgICAgdGhpcy5zdGF0cyA9IHtzaXplOiAwfTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIFJFR0xCdWZmZXIucHJvdG90eXBlLmJpbmQgPSBmdW5jdGlvbiAoKSB7XHJcbiAgICBnbC5iaW5kQnVmZmVyKHRoaXMudHlwZSwgdGhpcy5idWZmZXIpO1xyXG4gIH07XHJcblxyXG4gIFJFR0xCdWZmZXIucHJvdG90eXBlLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XHJcbiAgICBkZXN0cm95KHRoaXMpO1xyXG4gIH07XHJcblxyXG4gIHZhciBzdHJlYW1Qb29sID0gW107XHJcblxyXG4gIGZ1bmN0aW9uIGNyZWF0ZVN0cmVhbSAodHlwZSwgZGF0YSkge1xyXG4gICAgdmFyIGJ1ZmZlciA9IHN0cmVhbVBvb2wucG9wKCk7XHJcbiAgICBpZiAoIWJ1ZmZlcikge1xyXG4gICAgICBidWZmZXIgPSBuZXcgUkVHTEJ1ZmZlcih0eXBlKTtcclxuICAgIH1cclxuICAgIGJ1ZmZlci5iaW5kKCk7XHJcbiAgICBpbml0QnVmZmVyRnJvbURhdGEoYnVmZmVyLCBkYXRhLCBHTF9TVFJFQU1fRFJBVywgMCwgMSwgZmFsc2UpO1xyXG4gICAgcmV0dXJuIGJ1ZmZlclxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZGVzdHJveVN0cmVhbSAoc3RyZWFtJCQxKSB7XHJcbiAgICBzdHJlYW1Qb29sLnB1c2goc3RyZWFtJCQxKTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheSAoYnVmZmVyLCBkYXRhLCB1c2FnZSkge1xyXG4gICAgYnVmZmVyLmJ5dGVMZW5ndGggPSBkYXRhLmJ5dGVMZW5ndGg7XHJcbiAgICBnbC5idWZmZXJEYXRhKGJ1ZmZlci50eXBlLCBkYXRhLCB1c2FnZSk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBpbml0QnVmZmVyRnJvbURhdGEgKGJ1ZmZlciwgZGF0YSwgdXNhZ2UsIGR0eXBlLCBkaW1lbnNpb24sIHBlcnNpc3QpIHtcclxuICAgIHZhciBzaGFwZTtcclxuICAgIGJ1ZmZlci51c2FnZSA9IHVzYWdlO1xyXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcclxuICAgICAgYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgR0xfRkxPQVQkMztcclxuICAgICAgaWYgKGRhdGEubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIHZhciBmbGF0RGF0YTtcclxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShkYXRhWzBdKSkge1xyXG4gICAgICAgICAgc2hhcGUgPSBhcnJheVNoYXBlKGRhdGEpO1xyXG4gICAgICAgICAgdmFyIGRpbSA9IDE7XHJcbiAgICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IHNoYXBlLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgICAgICAgIGRpbSAqPSBzaGFwZVtpXTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBkaW07XHJcbiAgICAgICAgICBmbGF0RGF0YSA9IGFycmF5RmxhdHRlbihkYXRhLCBzaGFwZSwgYnVmZmVyLmR0eXBlKTtcclxuICAgICAgICAgIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheShidWZmZXIsIGZsYXREYXRhLCB1c2FnZSk7XHJcbiAgICAgICAgICBpZiAocGVyc2lzdCkge1xyXG4gICAgICAgICAgICBidWZmZXIucGVyc2lzdGVudERhdGEgPSBmbGF0RGF0YTtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHBvb2wuZnJlZVR5cGUoZmxhdERhdGEpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGRhdGFbMF0gPT09ICdudW1iZXInKSB7XHJcbiAgICAgICAgICBidWZmZXIuZGltZW5zaW9uID0gZGltZW5zaW9uO1xyXG4gICAgICAgICAgdmFyIHR5cGVkRGF0YSA9IHBvb2wuYWxsb2NUeXBlKGJ1ZmZlci5kdHlwZSwgZGF0YS5sZW5ndGgpO1xyXG4gICAgICAgICAgY29weUFycmF5KHR5cGVkRGF0YSwgZGF0YSk7XHJcbiAgICAgICAgICBpbml0QnVmZmVyRnJvbVR5cGVkQXJyYXkoYnVmZmVyLCB0eXBlZERhdGEsIHVzYWdlKTtcclxuICAgICAgICAgIGlmIChwZXJzaXN0KSB7XHJcbiAgICAgICAgICAgIGJ1ZmZlci5wZXJzaXN0ZW50RGF0YSA9IHR5cGVkRGF0YTtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHBvb2wuZnJlZVR5cGUodHlwZWREYXRhKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYgKGlzVHlwZWRBcnJheShkYXRhWzBdKSkge1xyXG4gICAgICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IGRhdGFbMF0ubGVuZ3RoO1xyXG4gICAgICAgICAgYnVmZmVyLmR0eXBlID0gZHR5cGUgfHwgdHlwZWRBcnJheUNvZGUoZGF0YVswXSkgfHwgR0xfRkxPQVQkMztcclxuICAgICAgICAgIGZsYXREYXRhID0gYXJyYXlGbGF0dGVuKFxyXG4gICAgICAgICAgICBkYXRhLFxyXG4gICAgICAgICAgICBbZGF0YS5sZW5ndGgsIGRhdGFbMF0ubGVuZ3RoXSxcclxuICAgICAgICAgICAgYnVmZmVyLmR0eXBlKTtcclxuICAgICAgICAgIGluaXRCdWZmZXJGcm9tVHlwZWRBcnJheShidWZmZXIsIGZsYXREYXRhLCB1c2FnZSk7XHJcbiAgICAgICAgICBpZiAocGVyc2lzdCkge1xyXG4gICAgICAgICAgICBidWZmZXIucGVyc2lzdGVudERhdGEgPSBmbGF0RGF0YTtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHBvb2wuZnJlZVR5cGUoZmxhdERhdGEpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBjaGVjayQxLnJhaXNlKCdpbnZhbGlkIGJ1ZmZlciBkYXRhJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9IGVsc2UgaWYgKGlzVHlwZWRBcnJheShkYXRhKSkge1xyXG4gICAgICBidWZmZXIuZHR5cGUgPSBkdHlwZSB8fCB0eXBlZEFycmF5Q29kZShkYXRhKTtcclxuICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IGRpbWVuc2lvbjtcclxuICAgICAgaW5pdEJ1ZmZlckZyb21UeXBlZEFycmF5KGJ1ZmZlciwgZGF0YSwgdXNhZ2UpO1xyXG4gICAgICBpZiAocGVyc2lzdCkge1xyXG4gICAgICAgIGJ1ZmZlci5wZXJzaXN0ZW50RGF0YSA9IG5ldyBVaW50OEFycmF5KG5ldyBVaW50OEFycmF5KGRhdGEuYnVmZmVyKSk7XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSBpZiAoaXNOREFycmF5TGlrZShkYXRhKSkge1xyXG4gICAgICBzaGFwZSA9IGRhdGEuc2hhcGU7XHJcbiAgICAgIHZhciBzdHJpZGUgPSBkYXRhLnN0cmlkZTtcclxuICAgICAgdmFyIG9mZnNldCA9IGRhdGEub2Zmc2V0O1xyXG5cclxuICAgICAgdmFyIHNoYXBlWCA9IDA7XHJcbiAgICAgIHZhciBzaGFwZVkgPSAwO1xyXG4gICAgICB2YXIgc3RyaWRlWCA9IDA7XHJcbiAgICAgIHZhciBzdHJpZGVZID0gMDtcclxuICAgICAgaWYgKHNoYXBlLmxlbmd0aCA9PT0gMSkge1xyXG4gICAgICAgIHNoYXBlWCA9IHNoYXBlWzBdO1xyXG4gICAgICAgIHNoYXBlWSA9IDE7XHJcbiAgICAgICAgc3RyaWRlWCA9IHN0cmlkZVswXTtcclxuICAgICAgICBzdHJpZGVZID0gMDtcclxuICAgICAgfSBlbHNlIGlmIChzaGFwZS5sZW5ndGggPT09IDIpIHtcclxuICAgICAgICBzaGFwZVggPSBzaGFwZVswXTtcclxuICAgICAgICBzaGFwZVkgPSBzaGFwZVsxXTtcclxuICAgICAgICBzdHJpZGVYID0gc3RyaWRlWzBdO1xyXG4gICAgICAgIHN0cmlkZVkgPSBzdHJpZGVbMV07XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgY2hlY2skMS5yYWlzZSgnaW52YWxpZCBzaGFwZScpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBidWZmZXIuZHR5cGUgPSBkdHlwZSB8fCB0eXBlZEFycmF5Q29kZShkYXRhLmRhdGEpIHx8IEdMX0ZMT0FUJDM7XHJcbiAgICAgIGJ1ZmZlci5kaW1lbnNpb24gPSBzaGFwZVk7XHJcblxyXG4gICAgICB2YXIgdHJhbnNwb3NlRGF0YSA9IHBvb2wuYWxsb2NUeXBlKGJ1ZmZlci5kdHlwZSwgc2hhcGVYICogc2hhcGVZKTtcclxuICAgICAgdHJhbnNwb3NlKHRyYW5zcG9zZURhdGEsXHJcbiAgICAgICAgZGF0YS5kYXRhLFxyXG4gICAgICAgIHNoYXBlWCwgc2hhcGVZLFxyXG4gICAgICAgIHN0cmlkZVgsIHN0cmlkZVksXHJcbiAgICAgICAgb2Zmc2V0KTtcclxuICAgICAgaW5pdEJ1ZmZlckZyb21UeXBlZEFycmF5KGJ1ZmZlciwgdHJhbnNwb3NlRGF0YSwgdXNhZ2UpO1xyXG4gICAgICBpZiAocGVyc2lzdCkge1xyXG4gICAgICAgIGJ1ZmZlci5wZXJzaXN0ZW50RGF0YSA9IHRyYW5zcG9zZURhdGE7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcG9vbC5mcmVlVHlwZSh0cmFuc3Bvc2VEYXRhKTtcclxuICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY2hlY2skMS5yYWlzZSgnaW52YWxpZCBidWZmZXIgZGF0YScpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZGVzdHJveSAoYnVmZmVyKSB7XHJcbiAgICBzdGF0cy5idWZmZXJDb3VudC0tO1xyXG5cclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXR0cmlidXRlU3RhdGUuc3RhdGUubGVuZ3RoOyArK2kpIHtcclxuICAgICAgdmFyIHJlY29yZCA9IGF0dHJpYnV0ZVN0YXRlLnN0YXRlW2ldO1xyXG4gICAgICBpZiAocmVjb3JkLmJ1ZmZlciA9PT0gYnVmZmVyKSB7XHJcbiAgICAgICAgZ2wuZGlzYWJsZVZlcnRleEF0dHJpYkFycmF5KGkpO1xyXG4gICAgICAgIHJlY29yZC5idWZmZXIgPSBudWxsO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIGhhbmRsZSA9IGJ1ZmZlci5idWZmZXI7XHJcbiAgICBjaGVjayQxKGhhbmRsZSwgJ2J1ZmZlciBtdXN0IG5vdCBiZSBkZWxldGVkIGFscmVhZHknKTtcclxuICAgIGdsLmRlbGV0ZUJ1ZmZlcihoYW5kbGUpO1xyXG4gICAgYnVmZmVyLmJ1ZmZlciA9IG51bGw7XHJcbiAgICBkZWxldGUgYnVmZmVyU2V0W2J1ZmZlci5pZF07XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBjcmVhdGVCdWZmZXIgKG9wdGlvbnMsIHR5cGUsIGRlZmVySW5pdCwgcGVyc2lzdGVudCkge1xyXG4gICAgc3RhdHMuYnVmZmVyQ291bnQrKztcclxuXHJcbiAgICB2YXIgYnVmZmVyID0gbmV3IFJFR0xCdWZmZXIodHlwZSk7XHJcbiAgICBidWZmZXJTZXRbYnVmZmVyLmlkXSA9IGJ1ZmZlcjtcclxuXHJcbiAgICBmdW5jdGlvbiByZWdsQnVmZmVyIChvcHRpb25zKSB7XHJcbiAgICAgIHZhciB1c2FnZSA9IEdMX1NUQVRJQ19EUkFXO1xyXG4gICAgICB2YXIgZGF0YSA9IG51bGw7XHJcbiAgICAgIHZhciBieXRlTGVuZ3RoID0gMDtcclxuICAgICAgdmFyIGR0eXBlID0gMDtcclxuICAgICAgdmFyIGRpbWVuc2lvbiA9IDE7XHJcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KG9wdGlvbnMpIHx8XHJcbiAgICAgICAgICBpc1R5cGVkQXJyYXkob3B0aW9ucykgfHxcclxuICAgICAgICAgIGlzTkRBcnJheUxpa2Uob3B0aW9ucykpIHtcclxuICAgICAgICBkYXRhID0gb3B0aW9ucztcclxuICAgICAgfSBlbHNlIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ251bWJlcicpIHtcclxuICAgICAgICBieXRlTGVuZ3RoID0gb3B0aW9ucyB8IDA7XHJcbiAgICAgIH0gZWxzZSBpZiAob3B0aW9ucykge1xyXG4gICAgICAgIGNoZWNrJDEudHlwZShcclxuICAgICAgICAgIG9wdGlvbnMsICdvYmplY3QnLFxyXG4gICAgICAgICAgJ2J1ZmZlciBhcmd1bWVudHMgbXVzdCBiZSBhbiBvYmplY3QsIGEgbnVtYmVyIG9yIGFuIGFycmF5Jyk7XHJcblxyXG4gICAgICAgIGlmICgnZGF0YScgaW4gb3B0aW9ucykge1xyXG4gICAgICAgICAgY2hlY2skMShcclxuICAgICAgICAgICAgZGF0YSA9PT0gbnVsbCB8fFxyXG4gICAgICAgICAgICBBcnJheS5pc0FycmF5KGRhdGEpIHx8XHJcbiAgICAgICAgICAgIGlzVHlwZWRBcnJheShkYXRhKSB8fFxyXG4gICAgICAgICAgICBpc05EQXJyYXlMaWtlKGRhdGEpLFxyXG4gICAgICAgICAgICAnaW52YWxpZCBkYXRhIGZvciBidWZmZXInKTtcclxuICAgICAgICAgIGRhdGEgPSBvcHRpb25zLmRhdGE7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoJ3VzYWdlJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgICBjaGVjayQxLnBhcmFtZXRlcihvcHRpb25zLnVzYWdlLCB1c2FnZVR5cGVzLCAnaW52YWxpZCBidWZmZXIgdXNhZ2UnKTtcclxuICAgICAgICAgIHVzYWdlID0gdXNhZ2VUeXBlc1tvcHRpb25zLnVzYWdlXTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICgndHlwZScgaW4gb3B0aW9ucykge1xyXG4gICAgICAgICAgY2hlY2skMS5wYXJhbWV0ZXIob3B0aW9ucy50eXBlLCBnbFR5cGVzLCAnaW52YWxpZCBidWZmZXIgdHlwZScpO1xyXG4gICAgICAgICAgZHR5cGUgPSBnbFR5cGVzW29wdGlvbnMudHlwZV07XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoJ2RpbWVuc2lvbicgaW4gb3B0aW9ucykge1xyXG4gICAgICAgICAgY2hlY2skMS50eXBlKG9wdGlvbnMuZGltZW5zaW9uLCAnbnVtYmVyJywgJ2ludmFsaWQgZGltZW5zaW9uJyk7XHJcbiAgICAgICAgICBkaW1lbnNpb24gPSBvcHRpb25zLmRpbWVuc2lvbiB8IDA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoJ2xlbmd0aCcgaW4gb3B0aW9ucykge1xyXG4gICAgICAgICAgY2hlY2skMS5ubmkoYnl0ZUxlbmd0aCwgJ2J1ZmZlciBsZW5ndGggbXVzdCBiZSBhIG5vbm5lZ2F0aXZlIGludGVnZXInKTtcclxuICAgICAgICAgIGJ5dGVMZW5ndGggPSBvcHRpb25zLmxlbmd0aCB8IDA7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICBidWZmZXIuYmluZCgpO1xyXG4gICAgICBpZiAoIWRhdGEpIHtcclxuICAgICAgICAvLyAjNDc1XHJcbiAgICAgICAgaWYgKGJ5dGVMZW5ndGgpIGdsLmJ1ZmZlckRhdGEoYnVmZmVyLnR5cGUsIGJ5dGVMZW5ndGgsIHVzYWdlKTtcclxuICAgICAgICBidWZmZXIuZHR5cGUgPSBkdHlwZSB8fCBHTF9VTlNJR05FRF9CWVRFJDM7XHJcbiAgICAgICAgYnVmZmVyLnVzYWdlID0gdXNhZ2U7XHJcbiAgICAgICAgYnVmZmVyLmRpbWVuc2lvbiA9IGRpbWVuc2lvbjtcclxuICAgICAgICBidWZmZXIuYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGg7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgaW5pdEJ1ZmZlckZyb21EYXRhKGJ1ZmZlciwgZGF0YSwgdXNhZ2UsIGR0eXBlLCBkaW1lbnNpb24sIHBlcnNpc3RlbnQpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcclxuICAgICAgICBidWZmZXIuc3RhdHMuc2l6ZSA9IGJ1ZmZlci5ieXRlTGVuZ3RoICogRFRZUEVTX1NJWkVTW2J1ZmZlci5kdHlwZV07XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiByZWdsQnVmZmVyXHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gc2V0U3ViRGF0YSAoZGF0YSwgb2Zmc2V0KSB7XHJcbiAgICAgIGNoZWNrJDEob2Zmc2V0ICsgZGF0YS5ieXRlTGVuZ3RoIDw9IGJ1ZmZlci5ieXRlTGVuZ3RoLFxyXG4gICAgICAgICdpbnZhbGlkIGJ1ZmZlciBzdWJkYXRhIGNhbGwsIGJ1ZmZlciBpcyB0b28gc21hbGwuICcgKyAnIENhblxcJ3Qgd3JpdGUgZGF0YSBvZiBzaXplICcgKyBkYXRhLmJ5dGVMZW5ndGggKyAnIHN0YXJ0aW5nIGZyb20gb2Zmc2V0ICcgKyBvZmZzZXQgKyAnIHRvIGEgYnVmZmVyIG9mIHNpemUgJyArIGJ1ZmZlci5ieXRlTGVuZ3RoKTtcclxuXHJcbiAgICAgIGdsLmJ1ZmZlclN1YkRhdGEoYnVmZmVyLnR5cGUsIG9mZnNldCwgZGF0YSk7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gc3ViZGF0YSAoZGF0YSwgb2Zmc2V0Xykge1xyXG4gICAgICB2YXIgb2Zmc2V0ID0gKG9mZnNldF8gfHwgMCkgfCAwO1xyXG4gICAgICB2YXIgc2hhcGU7XHJcbiAgICAgIGJ1ZmZlci5iaW5kKCk7XHJcbiAgICAgIGlmIChpc1R5cGVkQXJyYXkoZGF0YSkpIHtcclxuICAgICAgICBzZXRTdWJEYXRhKGRhdGEsIG9mZnNldCk7XHJcbiAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShkYXRhKSkge1xyXG4gICAgICAgIGlmIChkYXRhLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgIGlmICh0eXBlb2YgZGF0YVswXSA9PT0gJ251bWJlcicpIHtcclxuICAgICAgICAgICAgdmFyIGNvbnZlcnRlZCA9IHBvb2wuYWxsb2NUeXBlKGJ1ZmZlci5kdHlwZSwgZGF0YS5sZW5ndGgpO1xyXG4gICAgICAgICAgICBjb3B5QXJyYXkoY29udmVydGVkLCBkYXRhKTtcclxuICAgICAgICAgICAgc2V0U3ViRGF0YShjb252ZXJ0ZWQsIG9mZnNldCk7XHJcbiAgICAgICAgICAgIHBvb2wuZnJlZVR5cGUoY29udmVydGVkKTtcclxuICAgICAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShkYXRhWzBdKSB8fCBpc1R5cGVkQXJyYXkoZGF0YVswXSkpIHtcclxuICAgICAgICAgICAgc2hhcGUgPSBhcnJheVNoYXBlKGRhdGEpO1xyXG4gICAgICAgICAgICB2YXIgZmxhdERhdGEgPSBhcnJheUZsYXR0ZW4oZGF0YSwgc2hhcGUsIGJ1ZmZlci5kdHlwZSk7XHJcbiAgICAgICAgICAgIHNldFN1YkRhdGEoZmxhdERhdGEsIG9mZnNldCk7XHJcbiAgICAgICAgICAgIHBvb2wuZnJlZVR5cGUoZmxhdERhdGEpO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY2hlY2skMS5yYWlzZSgnaW52YWxpZCBidWZmZXIgZGF0YScpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIGlmIChpc05EQXJyYXlMaWtlKGRhdGEpKSB7XHJcbiAgICAgICAgc2hhcGUgPSBkYXRhLnNoYXBlO1xyXG4gICAgICAgIHZhciBzdHJpZGUgPSBkYXRhLnN0cmlkZTtcclxuXHJcbiAgICAgICAgdmFyIHNoYXBlWCA9IDA7XHJcbiAgICAgICAgdmFyIHNoYXBlWSA9IDA7XHJcbiAgICAgICAgdmFyIHN0cmlkZVggPSAwO1xyXG4gICAgICAgIHZhciBzdHJpZGVZID0gMDtcclxuICAgICAgICBpZiAoc2hhcGUubGVuZ3RoID09PSAxKSB7XHJcbiAgICAgICAgICBzaGFwZVggPSBzaGFwZVswXTtcclxuICAgICAgICAgIHNoYXBlWSA9IDE7XHJcbiAgICAgICAgICBzdHJpZGVYID0gc3RyaWRlWzBdO1xyXG4gICAgICAgICAgc3RyaWRlWSA9IDA7XHJcbiAgICAgICAgfSBlbHNlIGlmIChzaGFwZS5sZW5ndGggPT09IDIpIHtcclxuICAgICAgICAgIHNoYXBlWCA9IHNoYXBlWzBdO1xyXG4gICAgICAgICAgc2hhcGVZID0gc2hhcGVbMV07XHJcbiAgICAgICAgICBzdHJpZGVYID0gc3RyaWRlWzBdO1xyXG4gICAgICAgICAgc3RyaWRlWSA9IHN0cmlkZVsxXTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgY2hlY2skMS5yYWlzZSgnaW52YWxpZCBzaGFwZScpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB2YXIgZHR5cGUgPSBBcnJheS5pc0FycmF5KGRhdGEuZGF0YSlcclxuICAgICAgICAgID8gYnVmZmVyLmR0eXBlXHJcbiAgICAgICAgICA6IHR5cGVkQXJyYXlDb2RlKGRhdGEuZGF0YSk7XHJcblxyXG4gICAgICAgIHZhciB0cmFuc3Bvc2VEYXRhID0gcG9vbC5hbGxvY1R5cGUoZHR5cGUsIHNoYXBlWCAqIHNoYXBlWSk7XHJcbiAgICAgICAgdHJhbnNwb3NlKHRyYW5zcG9zZURhdGEsXHJcbiAgICAgICAgICBkYXRhLmRhdGEsXHJcbiAgICAgICAgICBzaGFwZVgsIHNoYXBlWSxcclxuICAgICAgICAgIHN0cmlkZVgsIHN0cmlkZVksXHJcbiAgICAgICAgICBkYXRhLm9mZnNldCk7XHJcbiAgICAgICAgc2V0U3ViRGF0YSh0cmFuc3Bvc2VEYXRhLCBvZmZzZXQpO1xyXG4gICAgICAgIHBvb2wuZnJlZVR5cGUodHJhbnNwb3NlRGF0YSk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgY2hlY2skMS5yYWlzZSgnaW52YWxpZCBkYXRhIGZvciBidWZmZXIgc3ViZGF0YScpO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiByZWdsQnVmZmVyXHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCFkZWZlckluaXQpIHtcclxuICAgICAgcmVnbEJ1ZmZlcihvcHRpb25zKTtcclxuICAgIH1cclxuXHJcbiAgICByZWdsQnVmZmVyLl9yZWdsVHlwZSA9ICdidWZmZXInO1xyXG4gICAgcmVnbEJ1ZmZlci5fYnVmZmVyID0gYnVmZmVyO1xyXG4gICAgcmVnbEJ1ZmZlci5zdWJkYXRhID0gc3ViZGF0YTtcclxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xyXG4gICAgICByZWdsQnVmZmVyLnN0YXRzID0gYnVmZmVyLnN0YXRzO1xyXG4gICAgfVxyXG4gICAgcmVnbEJ1ZmZlci5kZXN0cm95ID0gZnVuY3Rpb24gKCkgeyBkZXN0cm95KGJ1ZmZlcik7IH07XHJcblxyXG4gICAgcmV0dXJuIHJlZ2xCdWZmZXJcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHJlc3RvcmVCdWZmZXJzICgpIHtcclxuICAgIHZhbHVlcyhidWZmZXJTZXQpLmZvckVhY2goZnVuY3Rpb24gKGJ1ZmZlcikge1xyXG4gICAgICBidWZmZXIuYnVmZmVyID0gZ2wuY3JlYXRlQnVmZmVyKCk7XHJcbiAgICAgIGdsLmJpbmRCdWZmZXIoYnVmZmVyLnR5cGUsIGJ1ZmZlci5idWZmZXIpO1xyXG4gICAgICBnbC5idWZmZXJEYXRhKFxyXG4gICAgICAgIGJ1ZmZlci50eXBlLCBidWZmZXIucGVyc2lzdGVudERhdGEgfHwgYnVmZmVyLmJ5dGVMZW5ndGgsIGJ1ZmZlci51c2FnZSk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIGlmIChjb25maWcucHJvZmlsZSkge1xyXG4gICAgc3RhdHMuZ2V0VG90YWxCdWZmZXJTaXplID0gZnVuY3Rpb24gKCkge1xyXG4gICAgICB2YXIgdG90YWwgPSAwO1xyXG4gICAgICAvLyBUT0RPOiBSaWdodCBub3csIHRoZSBzdHJlYW1zIGFyZSBub3QgcGFydCBvZiB0aGUgdG90YWwgY291bnQuXHJcbiAgICAgIE9iamVjdC5rZXlzKGJ1ZmZlclNldCkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XHJcbiAgICAgICAgdG90YWwgKz0gYnVmZmVyU2V0W2tleV0uc3RhdHMuc2l6ZTtcclxuICAgICAgfSk7XHJcbiAgICAgIHJldHVybiB0b3RhbFxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIHJldHVybiB7XHJcbiAgICBjcmVhdGU6IGNyZWF0ZUJ1ZmZlcixcclxuXHJcbiAgICBjcmVhdGVTdHJlYW06IGNyZWF0ZVN0cmVhbSxcclxuICAgIGRlc3Ryb3lTdHJlYW06IGRlc3Ryb3lTdHJlYW0sXHJcblxyXG4gICAgY2xlYXI6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgdmFsdWVzKGJ1ZmZlclNldCkuZm9yRWFjaChkZXN0cm95KTtcclxuICAgICAgc3RyZWFtUG9vbC5mb3JFYWNoKGRlc3Ryb3kpO1xyXG4gICAgfSxcclxuXHJcbiAgICBnZXRCdWZmZXI6IGZ1bmN0aW9uICh3cmFwcGVyKSB7XHJcbiAgICAgIGlmICh3cmFwcGVyICYmIHdyYXBwZXIuX2J1ZmZlciBpbnN0YW5jZW9mIFJFR0xCdWZmZXIpIHtcclxuICAgICAgICByZXR1cm4gd3JhcHBlci5fYnVmZmVyXHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIG51bGxcclxuICAgIH0sXHJcblxyXG4gICAgcmVzdG9yZTogcmVzdG9yZUJ1ZmZlcnMsXHJcblxyXG4gICAgX2luaXRCdWZmZXI6IGluaXRCdWZmZXJGcm9tRGF0YVxyXG4gIH1cclxufVxuXG52YXIgcG9pbnRzID0gMDtcbnZhciBwb2ludCA9IDA7XG52YXIgbGluZXMgPSAxO1xudmFyIGxpbmUgPSAxO1xudmFyIHRyaWFuZ2xlcyA9IDQ7XG52YXIgdHJpYW5nbGUgPSA0O1xudmFyIHByaW1UeXBlcyA9IHtcblx0cG9pbnRzOiBwb2ludHMsXG5cdHBvaW50OiBwb2ludCxcblx0bGluZXM6IGxpbmVzLFxuXHRsaW5lOiBsaW5lLFxuXHR0cmlhbmdsZXM6IHRyaWFuZ2xlcyxcblx0dHJpYW5nbGU6IHRyaWFuZ2xlLFxuXHRcImxpbmUgbG9vcFwiOiAyLFxuXHRcImxpbmUgc3RyaXBcIjogMyxcblx0XCJ0cmlhbmdsZSBzdHJpcFwiOiA1LFxuXHRcInRyaWFuZ2xlIGZhblwiOiA2XG59O1xuXG52YXIgR0xfUE9JTlRTID0gMDtcclxudmFyIEdMX0xJTkVTID0gMTtcclxudmFyIEdMX1RSSUFOR0xFUyA9IDQ7XHJcblxyXG52YXIgR0xfQllURSQyID0gNTEyMDtcclxudmFyIEdMX1VOU0lHTkVEX0JZVEUkNCA9IDUxMjE7XHJcbnZhciBHTF9TSE9SVCQyID0gNTEyMjtcclxudmFyIEdMX1VOU0lHTkVEX1NIT1JUJDIgPSA1MTIzO1xyXG52YXIgR0xfSU5UJDIgPSA1MTI0O1xyXG52YXIgR0xfVU5TSUdORURfSU5UJDIgPSA1MTI1O1xyXG5cclxudmFyIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSID0gMzQ5NjM7XHJcblxyXG52YXIgR0xfU1RSRUFNX0RSQVckMSA9IDB4ODhFMDtcclxudmFyIEdMX1NUQVRJQ19EUkFXJDEgPSAweDg4RTQ7XHJcblxyXG5mdW5jdGlvbiB3cmFwRWxlbWVudHNTdGF0ZSAoZ2wsIGV4dGVuc2lvbnMsIGJ1ZmZlclN0YXRlLCBzdGF0cykge1xyXG4gIHZhciBlbGVtZW50U2V0ID0ge307XHJcbiAgdmFyIGVsZW1lbnRDb3VudCA9IDA7XHJcblxyXG4gIHZhciBlbGVtZW50VHlwZXMgPSB7XHJcbiAgICAndWludDgnOiBHTF9VTlNJR05FRF9CWVRFJDQsXHJcbiAgICAndWludDE2JzogR0xfVU5TSUdORURfU0hPUlQkMlxyXG4gIH07XHJcblxyXG4gIGlmIChleHRlbnNpb25zLm9lc19lbGVtZW50X2luZGV4X3VpbnQpIHtcclxuICAgIGVsZW1lbnRUeXBlcy51aW50MzIgPSBHTF9VTlNJR05FRF9JTlQkMjtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIFJFR0xFbGVtZW50QnVmZmVyIChidWZmZXIpIHtcclxuICAgIHRoaXMuaWQgPSBlbGVtZW50Q291bnQrKztcclxuICAgIGVsZW1lbnRTZXRbdGhpcy5pZF0gPSB0aGlzO1xyXG4gICAgdGhpcy5idWZmZXIgPSBidWZmZXI7XHJcbiAgICB0aGlzLnByaW1UeXBlID0gR0xfVFJJQU5HTEVTO1xyXG4gICAgdGhpcy52ZXJ0Q291bnQgPSAwO1xyXG4gICAgdGhpcy50eXBlID0gMDtcclxuICB9XHJcblxyXG4gIFJFR0xFbGVtZW50QnVmZmVyLnByb3RvdHlwZS5iaW5kID0gZnVuY3Rpb24gKCkge1xyXG4gICAgdGhpcy5idWZmZXIuYmluZCgpO1xyXG4gIH07XHJcblxyXG4gIHZhciBidWZmZXJQb29sID0gW107XHJcblxyXG4gIGZ1bmN0aW9uIGNyZWF0ZUVsZW1lbnRTdHJlYW0gKGRhdGEpIHtcclxuICAgIHZhciByZXN1bHQgPSBidWZmZXJQb29sLnBvcCgpO1xyXG4gICAgaWYgKCFyZXN1bHQpIHtcclxuICAgICAgcmVzdWx0ID0gbmV3IFJFR0xFbGVtZW50QnVmZmVyKGJ1ZmZlclN0YXRlLmNyZWF0ZShcclxuICAgICAgICBudWxsLFxyXG4gICAgICAgIEdMX0VMRU1FTlRfQVJSQVlfQlVGRkVSLFxyXG4gICAgICAgIHRydWUsXHJcbiAgICAgICAgZmFsc2UpLl9idWZmZXIpO1xyXG4gICAgfVxyXG4gICAgaW5pdEVsZW1lbnRzKHJlc3VsdCwgZGF0YSwgR0xfU1RSRUFNX0RSQVckMSwgLTEsIC0xLCAwLCAwKTtcclxuICAgIHJldHVybiByZXN1bHRcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGRlc3Ryb3lFbGVtZW50U3RyZWFtIChlbGVtZW50cykge1xyXG4gICAgYnVmZmVyUG9vbC5wdXNoKGVsZW1lbnRzKTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGluaXRFbGVtZW50cyAoXHJcbiAgICBlbGVtZW50cyxcclxuICAgIGRhdGEsXHJcbiAgICB1c2FnZSxcclxuICAgIHByaW0sXHJcbiAgICBjb3VudCxcclxuICAgIGJ5dGVMZW5ndGgsXHJcbiAgICB0eXBlKSB7XHJcbiAgICBlbGVtZW50cy5idWZmZXIuYmluZCgpO1xyXG4gICAgaWYgKGRhdGEpIHtcclxuICAgICAgdmFyIHByZWRpY3RlZFR5cGUgPSB0eXBlO1xyXG4gICAgICBpZiAoIXR5cGUgJiYgKFxyXG4gICAgICAgICAgIWlzVHlwZWRBcnJheShkYXRhKSB8fFxyXG4gICAgICAgICAoaXNOREFycmF5TGlrZShkYXRhKSAmJiAhaXNUeXBlZEFycmF5KGRhdGEuZGF0YSkpKSkge1xyXG4gICAgICAgIHByZWRpY3RlZFR5cGUgPSBleHRlbnNpb25zLm9lc19lbGVtZW50X2luZGV4X3VpbnRcclxuICAgICAgICAgID8gR0xfVU5TSUdORURfSU5UJDJcclxuICAgICAgICAgIDogR0xfVU5TSUdORURfU0hPUlQkMjtcclxuICAgICAgfVxyXG4gICAgICBidWZmZXJTdGF0ZS5faW5pdEJ1ZmZlcihcclxuICAgICAgICBlbGVtZW50cy5idWZmZXIsXHJcbiAgICAgICAgZGF0YSxcclxuICAgICAgICB1c2FnZSxcclxuICAgICAgICBwcmVkaWN0ZWRUeXBlLFxyXG4gICAgICAgIDMpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgZ2wuYnVmZmVyRGF0YShHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiwgYnl0ZUxlbmd0aCwgdXNhZ2UpO1xyXG4gICAgICBlbGVtZW50cy5idWZmZXIuZHR5cGUgPSBkdHlwZSB8fCBHTF9VTlNJR05FRF9CWVRFJDQ7XHJcbiAgICAgIGVsZW1lbnRzLmJ1ZmZlci51c2FnZSA9IHVzYWdlO1xyXG4gICAgICBlbGVtZW50cy5idWZmZXIuZGltZW5zaW9uID0gMztcclxuICAgICAgZWxlbWVudHMuYnVmZmVyLmJ5dGVMZW5ndGggPSBieXRlTGVuZ3RoO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBkdHlwZSA9IHR5cGU7XHJcbiAgICBpZiAoIXR5cGUpIHtcclxuICAgICAgc3dpdGNoIChlbGVtZW50cy5idWZmZXIuZHR5cGUpIHtcclxuICAgICAgICBjYXNlIEdMX1VOU0lHTkVEX0JZVEUkNDpcclxuICAgICAgICBjYXNlIEdMX0JZVEUkMjpcclxuICAgICAgICAgIGR0eXBlID0gR0xfVU5TSUdORURfQllURSQ0O1xyXG4gICAgICAgICAgYnJlYWtcclxuXHJcbiAgICAgICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVCQyOlxyXG4gICAgICAgIGNhc2UgR0xfU0hPUlQkMjpcclxuICAgICAgICAgIGR0eXBlID0gR0xfVU5TSUdORURfU0hPUlQkMjtcclxuICAgICAgICAgIGJyZWFrXHJcblxyXG4gICAgICAgIGNhc2UgR0xfVU5TSUdORURfSU5UJDI6XHJcbiAgICAgICAgY2FzZSBHTF9JTlQkMjpcclxuICAgICAgICAgIGR0eXBlID0gR0xfVU5TSUdORURfSU5UJDI7XHJcbiAgICAgICAgICBicmVha1xyXG5cclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgY2hlY2skMS5yYWlzZSgndW5zdXBwb3J0ZWQgdHlwZSBmb3IgZWxlbWVudCBhcnJheScpO1xyXG4gICAgICB9XHJcbiAgICAgIGVsZW1lbnRzLmJ1ZmZlci5kdHlwZSA9IGR0eXBlO1xyXG4gICAgfVxyXG4gICAgZWxlbWVudHMudHlwZSA9IGR0eXBlO1xyXG5cclxuICAgIC8vIENoZWNrIG9lc19lbGVtZW50X2luZGV4X3VpbnQgZXh0ZW5zaW9uXHJcbiAgICBjaGVjayQxKFxyXG4gICAgICBkdHlwZSAhPT0gR0xfVU5TSUdORURfSU5UJDIgfHxcclxuICAgICAgISFleHRlbnNpb25zLm9lc19lbGVtZW50X2luZGV4X3VpbnQsXHJcbiAgICAgICczMiBiaXQgZWxlbWVudCBidWZmZXJzIG5vdCBzdXBwb3J0ZWQsIGVuYWJsZSBvZXNfZWxlbWVudF9pbmRleF91aW50IGZpcnN0Jyk7XHJcblxyXG4gICAgLy8gdHJ5IHRvIGd1ZXNzIGRlZmF1bHQgcHJpbWl0aXZlIHR5cGUgYW5kIGFyZ3VtZW50c1xyXG4gICAgdmFyIHZlcnRDb3VudCA9IGNvdW50O1xyXG4gICAgaWYgKHZlcnRDb3VudCA8IDApIHtcclxuICAgICAgdmVydENvdW50ID0gZWxlbWVudHMuYnVmZmVyLmJ5dGVMZW5ndGg7XHJcbiAgICAgIGlmIChkdHlwZSA9PT0gR0xfVU5TSUdORURfU0hPUlQkMikge1xyXG4gICAgICAgIHZlcnRDb3VudCA+Pj0gMTtcclxuICAgICAgfSBlbHNlIGlmIChkdHlwZSA9PT0gR0xfVU5TSUdORURfSU5UJDIpIHtcclxuICAgICAgICB2ZXJ0Q291bnQgPj49IDI7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIGVsZW1lbnRzLnZlcnRDb3VudCA9IHZlcnRDb3VudDtcclxuXHJcbiAgICAvLyB0cnkgdG8gZ3Vlc3MgcHJpbWl0aXZlIHR5cGUgZnJvbSBjZWxsIGRpbWVuc2lvblxyXG4gICAgdmFyIHByaW1UeXBlID0gcHJpbTtcclxuICAgIGlmIChwcmltIDwgMCkge1xyXG4gICAgICBwcmltVHlwZSA9IEdMX1RSSUFOR0xFUztcclxuICAgICAgdmFyIGRpbWVuc2lvbiA9IGVsZW1lbnRzLmJ1ZmZlci5kaW1lbnNpb247XHJcbiAgICAgIGlmIChkaW1lbnNpb24gPT09IDEpIHByaW1UeXBlID0gR0xfUE9JTlRTO1xyXG4gICAgICBpZiAoZGltZW5zaW9uID09PSAyKSBwcmltVHlwZSA9IEdMX0xJTkVTO1xyXG4gICAgICBpZiAoZGltZW5zaW9uID09PSAzKSBwcmltVHlwZSA9IEdMX1RSSUFOR0xFUztcclxuICAgIH1cclxuICAgIGVsZW1lbnRzLnByaW1UeXBlID0gcHJpbVR5cGU7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBkZXN0cm95RWxlbWVudHMgKGVsZW1lbnRzKSB7XHJcbiAgICBzdGF0cy5lbGVtZW50c0NvdW50LS07XHJcblxyXG4gICAgY2hlY2skMShlbGVtZW50cy5idWZmZXIgIT09IG51bGwsICdtdXN0IG5vdCBkb3VibGUgZGVzdHJveSBlbGVtZW50cycpO1xyXG4gICAgZGVsZXRlIGVsZW1lbnRTZXRbZWxlbWVudHMuaWRdO1xyXG4gICAgZWxlbWVudHMuYnVmZmVyLmRlc3Ryb3koKTtcclxuICAgIGVsZW1lbnRzLmJ1ZmZlciA9IG51bGw7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBjcmVhdGVFbGVtZW50cyAob3B0aW9ucywgcGVyc2lzdGVudCkge1xyXG4gICAgdmFyIGJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmNyZWF0ZShudWxsLCBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiwgdHJ1ZSk7XHJcbiAgICB2YXIgZWxlbWVudHMgPSBuZXcgUkVHTEVsZW1lbnRCdWZmZXIoYnVmZmVyLl9idWZmZXIpO1xyXG4gICAgc3RhdHMuZWxlbWVudHNDb3VudCsrO1xyXG5cclxuICAgIGZ1bmN0aW9uIHJlZ2xFbGVtZW50cyAob3B0aW9ucykge1xyXG4gICAgICBpZiAoIW9wdGlvbnMpIHtcclxuICAgICAgICBidWZmZXIoKTtcclxuICAgICAgICBlbGVtZW50cy5wcmltVHlwZSA9IEdMX1RSSUFOR0xFUztcclxuICAgICAgICBlbGVtZW50cy52ZXJ0Q291bnQgPSAwO1xyXG4gICAgICAgIGVsZW1lbnRzLnR5cGUgPSBHTF9VTlNJR05FRF9CWVRFJDQ7XHJcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdudW1iZXInKSB7XHJcbiAgICAgICAgYnVmZmVyKG9wdGlvbnMpO1xyXG4gICAgICAgIGVsZW1lbnRzLnByaW1UeXBlID0gR0xfVFJJQU5HTEVTO1xyXG4gICAgICAgIGVsZW1lbnRzLnZlcnRDb3VudCA9IG9wdGlvbnMgfCAwO1xyXG4gICAgICAgIGVsZW1lbnRzLnR5cGUgPSBHTF9VTlNJR05FRF9CWVRFJDQ7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdmFyIGRhdGEgPSBudWxsO1xyXG4gICAgICAgIHZhciB1c2FnZSA9IEdMX1NUQVRJQ19EUkFXJDE7XHJcbiAgICAgICAgdmFyIHByaW1UeXBlID0gLTE7XHJcbiAgICAgICAgdmFyIHZlcnRDb3VudCA9IC0xO1xyXG4gICAgICAgIHZhciBieXRlTGVuZ3RoID0gMDtcclxuICAgICAgICB2YXIgZHR5cGUgPSAwO1xyXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KG9wdGlvbnMpIHx8XHJcbiAgICAgICAgICAgIGlzVHlwZWRBcnJheShvcHRpb25zKSB8fFxyXG4gICAgICAgICAgICBpc05EQXJyYXlMaWtlKG9wdGlvbnMpKSB7XHJcbiAgICAgICAgICBkYXRhID0gb3B0aW9ucztcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgY2hlY2skMS50eXBlKG9wdGlvbnMsICdvYmplY3QnLCAnaW52YWxpZCBhcmd1bWVudHMgZm9yIGVsZW1lbnRzJyk7XHJcbiAgICAgICAgICBpZiAoJ2RhdGEnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgICAgZGF0YSA9IG9wdGlvbnMuZGF0YTtcclxuICAgICAgICAgICAgY2hlY2skMShcclxuICAgICAgICAgICAgICAgIEFycmF5LmlzQXJyYXkoZGF0YSkgfHxcclxuICAgICAgICAgICAgICAgIGlzVHlwZWRBcnJheShkYXRhKSB8fFxyXG4gICAgICAgICAgICAgICAgaXNOREFycmF5TGlrZShkYXRhKSxcclxuICAgICAgICAgICAgICAgICdpbnZhbGlkIGRhdGEgZm9yIGVsZW1lbnQgYnVmZmVyJyk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBpZiAoJ3VzYWdlJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgICAgIGNoZWNrJDEucGFyYW1ldGVyKFxyXG4gICAgICAgICAgICAgIG9wdGlvbnMudXNhZ2UsXHJcbiAgICAgICAgICAgICAgdXNhZ2VUeXBlcyxcclxuICAgICAgICAgICAgICAnaW52YWxpZCBlbGVtZW50IGJ1ZmZlciB1c2FnZScpO1xyXG4gICAgICAgICAgICB1c2FnZSA9IHVzYWdlVHlwZXNbb3B0aW9ucy51c2FnZV07XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBpZiAoJ3ByaW1pdGl2ZScgaW4gb3B0aW9ucykge1xyXG4gICAgICAgICAgICBjaGVjayQxLnBhcmFtZXRlcihcclxuICAgICAgICAgICAgICBvcHRpb25zLnByaW1pdGl2ZSxcclxuICAgICAgICAgICAgICBwcmltVHlwZXMsXHJcbiAgICAgICAgICAgICAgJ2ludmFsaWQgZWxlbWVudCBidWZmZXIgcHJpbWl0aXZlJyk7XHJcbiAgICAgICAgICAgIHByaW1UeXBlID0gcHJpbVR5cGVzW29wdGlvbnMucHJpbWl0aXZlXTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGlmICgnY291bnQnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgICAgY2hlY2skMShcclxuICAgICAgICAgICAgICB0eXBlb2Ygb3B0aW9ucy5jb3VudCA9PT0gJ251bWJlcicgJiYgb3B0aW9ucy5jb3VudCA+PSAwLFxyXG4gICAgICAgICAgICAgICdpbnZhbGlkIHZlcnRleCBjb3VudCBmb3IgZWxlbWVudHMnKTtcclxuICAgICAgICAgICAgdmVydENvdW50ID0gb3B0aW9ucy5jb3VudCB8IDA7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBpZiAoJ3R5cGUnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgICAgY2hlY2skMS5wYXJhbWV0ZXIoXHJcbiAgICAgICAgICAgICAgb3B0aW9ucy50eXBlLFxyXG4gICAgICAgICAgICAgIGVsZW1lbnRUeXBlcyxcclxuICAgICAgICAgICAgICAnaW52YWxpZCBidWZmZXIgdHlwZScpO1xyXG4gICAgICAgICAgICBkdHlwZSA9IGVsZW1lbnRUeXBlc1tvcHRpb25zLnR5cGVdO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgaWYgKCdsZW5ndGgnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgICAgYnl0ZUxlbmd0aCA9IG9wdGlvbnMubGVuZ3RoIHwgMDtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGJ5dGVMZW5ndGggPSB2ZXJ0Q291bnQ7XHJcbiAgICAgICAgICAgIGlmIChkdHlwZSA9PT0gR0xfVU5TSUdORURfU0hPUlQkMiB8fCBkdHlwZSA9PT0gR0xfU0hPUlQkMikge1xyXG4gICAgICAgICAgICAgIGJ5dGVMZW5ndGggKj0gMjtcclxuICAgICAgICAgICAgfSBlbHNlIGlmIChkdHlwZSA9PT0gR0xfVU5TSUdORURfSU5UJDIgfHwgZHR5cGUgPT09IEdMX0lOVCQyKSB7XHJcbiAgICAgICAgICAgICAgYnl0ZUxlbmd0aCAqPSA0O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGluaXRFbGVtZW50cyhcclxuICAgICAgICAgIGVsZW1lbnRzLFxyXG4gICAgICAgICAgZGF0YSxcclxuICAgICAgICAgIHVzYWdlLFxyXG4gICAgICAgICAgcHJpbVR5cGUsXHJcbiAgICAgICAgICB2ZXJ0Q291bnQsXHJcbiAgICAgICAgICBieXRlTGVuZ3RoLFxyXG4gICAgICAgICAgZHR5cGUpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICByZXR1cm4gcmVnbEVsZW1lbnRzXHJcbiAgICB9XHJcblxyXG4gICAgcmVnbEVsZW1lbnRzKG9wdGlvbnMpO1xyXG5cclxuICAgIHJlZ2xFbGVtZW50cy5fcmVnbFR5cGUgPSAnZWxlbWVudHMnO1xyXG4gICAgcmVnbEVsZW1lbnRzLl9lbGVtZW50cyA9IGVsZW1lbnRzO1xyXG4gICAgcmVnbEVsZW1lbnRzLnN1YmRhdGEgPSBmdW5jdGlvbiAoZGF0YSwgb2Zmc2V0KSB7XHJcbiAgICAgIGJ1ZmZlci5zdWJkYXRhKGRhdGEsIG9mZnNldCk7XHJcbiAgICAgIHJldHVybiByZWdsRWxlbWVudHNcclxuICAgIH07XHJcbiAgICByZWdsRWxlbWVudHMuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcclxuICAgICAgZGVzdHJveUVsZW1lbnRzKGVsZW1lbnRzKTtcclxuICAgIH07XHJcblxyXG4gICAgcmV0dXJuIHJlZ2xFbGVtZW50c1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIGNyZWF0ZTogY3JlYXRlRWxlbWVudHMsXHJcbiAgICBjcmVhdGVTdHJlYW06IGNyZWF0ZUVsZW1lbnRTdHJlYW0sXHJcbiAgICBkZXN0cm95U3RyZWFtOiBkZXN0cm95RWxlbWVudFN0cmVhbSxcclxuICAgIGdldEVsZW1lbnRzOiBmdW5jdGlvbiAoZWxlbWVudHMpIHtcclxuICAgICAgaWYgKHR5cGVvZiBlbGVtZW50cyA9PT0gJ2Z1bmN0aW9uJyAmJlxyXG4gICAgICAgICAgZWxlbWVudHMuX2VsZW1lbnRzIGluc3RhbmNlb2YgUkVHTEVsZW1lbnRCdWZmZXIpIHtcclxuICAgICAgICByZXR1cm4gZWxlbWVudHMuX2VsZW1lbnRzXHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIG51bGxcclxuICAgIH0sXHJcbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xyXG4gICAgICB2YWx1ZXMoZWxlbWVudFNldCkuZm9yRWFjaChkZXN0cm95RWxlbWVudHMpO1xyXG4gICAgfVxyXG4gIH1cclxufVxuXG52YXIgRkxPQVQgPSBuZXcgRmxvYXQzMkFycmF5KDEpO1xyXG52YXIgSU5UID0gbmV3IFVpbnQzMkFycmF5KEZMT0FULmJ1ZmZlcik7XHJcblxyXG52YXIgR0xfVU5TSUdORURfU0hPUlQkNCA9IDUxMjM7XHJcblxyXG5mdW5jdGlvbiBjb252ZXJ0VG9IYWxmRmxvYXQgKGFycmF5KSB7XHJcbiAgdmFyIHVzaG9ydHMgPSBwb29sLmFsbG9jVHlwZShHTF9VTlNJR05FRF9TSE9SVCQ0LCBhcnJheS5sZW5ndGgpO1xyXG5cclxuICBmb3IgKHZhciBpID0gMDsgaSA8IGFycmF5Lmxlbmd0aDsgKytpKSB7XHJcbiAgICBpZiAoaXNOYU4oYXJyYXlbaV0pKSB7XHJcbiAgICAgIHVzaG9ydHNbaV0gPSAweGZmZmY7XHJcbiAgICB9IGVsc2UgaWYgKGFycmF5W2ldID09PSBJbmZpbml0eSkge1xyXG4gICAgICB1c2hvcnRzW2ldID0gMHg3YzAwO1xyXG4gICAgfSBlbHNlIGlmIChhcnJheVtpXSA9PT0gLUluZmluaXR5KSB7XHJcbiAgICAgIHVzaG9ydHNbaV0gPSAweGZjMDA7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBGTE9BVFswXSA9IGFycmF5W2ldO1xyXG4gICAgICB2YXIgeCA9IElOVFswXTtcclxuXHJcbiAgICAgIHZhciBzZ24gPSAoeCA+Pj4gMzEpIDw8IDE1O1xyXG4gICAgICB2YXIgZXhwID0gKCh4IDw8IDEpID4+PiAyNCkgLSAxMjc7XHJcbiAgICAgIHZhciBmcmFjID0gKHggPj4gMTMpICYgKCgxIDw8IDEwKSAtIDEpO1xyXG5cclxuICAgICAgaWYgKGV4cCA8IC0yNCkge1xyXG4gICAgICAgIC8vIHJvdW5kIG5vbi1yZXByZXNlbnRhYmxlIGRlbm9ybWFscyB0byAwXHJcbiAgICAgICAgdXNob3J0c1tpXSA9IHNnbjtcclxuICAgICAgfSBlbHNlIGlmIChleHAgPCAtMTQpIHtcclxuICAgICAgICAvLyBoYW5kbGUgZGVub3JtYWxzXHJcbiAgICAgICAgdmFyIHMgPSAtMTQgLSBleHA7XHJcbiAgICAgICAgdXNob3J0c1tpXSA9IHNnbiArICgoZnJhYyArICgxIDw8IDEwKSkgPj4gcyk7XHJcbiAgICAgIH0gZWxzZSBpZiAoZXhwID4gMTUpIHtcclxuICAgICAgICAvLyByb3VuZCBvdmVyZmxvdyB0byArLy0gSW5maW5pdHlcclxuICAgICAgICB1c2hvcnRzW2ldID0gc2duICsgMHg3YzAwO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIC8vIG90aGVyd2lzZSBjb252ZXJ0IGRpcmVjdGx5XHJcbiAgICAgICAgdXNob3J0c1tpXSA9IHNnbiArICgoZXhwICsgMTUpIDw8IDEwKSArIGZyYWM7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIHJldHVybiB1c2hvcnRzXHJcbn1cblxuZnVuY3Rpb24gaXNBcnJheUxpa2UgKHMpIHtcclxuICByZXR1cm4gQXJyYXkuaXNBcnJheShzKSB8fCBpc1R5cGVkQXJyYXkocylcclxufVxuXG52YXIgaXNQb3cyJDEgPSBmdW5jdGlvbiAodikge1xyXG4gIHJldHVybiAhKHYgJiAodiAtIDEpKSAmJiAoISF2KVxyXG59O1xuXG52YXIgR0xfQ09NUFJFU1NFRF9URVhUVVJFX0ZPUk1BVFMgPSAweDg2QTM7XHJcblxyXG52YXIgR0xfVEVYVFVSRV8yRCQxID0gMHgwREUxO1xyXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUCQxID0gMHg4NTEzO1xyXG52YXIgR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YJDEgPSAweDg1MTU7XHJcblxyXG52YXIgR0xfUkdCQSQxID0gMHgxOTA4O1xyXG52YXIgR0xfQUxQSEEgPSAweDE5MDY7XHJcbnZhciBHTF9SR0IgPSAweDE5MDc7XHJcbnZhciBHTF9MVU1JTkFOQ0UgPSAweDE5MDk7XHJcbnZhciBHTF9MVU1JTkFOQ0VfQUxQSEEgPSAweDE5MEE7XHJcblxyXG52YXIgR0xfUkdCQTQgPSAweDgwNTY7XHJcbnZhciBHTF9SR0I1X0ExID0gMHg4MDU3O1xyXG52YXIgR0xfUkdCNTY1ID0gMHg4RDYyO1xyXG5cclxudmFyIEdMX1VOU0lHTkVEX1NIT1JUXzRfNF80XzQkMSA9IDB4ODAzMztcclxudmFyIEdMX1VOU0lHTkVEX1NIT1JUXzVfNV81XzEkMSA9IDB4ODAzNDtcclxudmFyIEdMX1VOU0lHTkVEX1NIT1JUXzVfNl81JDEgPSAweDgzNjM7XHJcbnZhciBHTF9VTlNJR05FRF9JTlRfMjRfOF9XRUJHTCQxID0gMHg4NEZBO1xyXG5cclxudmFyIEdMX0RFUFRIX0NPTVBPTkVOVCA9IDB4MTkwMjtcclxudmFyIEdMX0RFUFRIX1NURU5DSUwgPSAweDg0Rjk7XHJcblxyXG52YXIgR0xfU1JHQl9FWFQgPSAweDhDNDA7XHJcbnZhciBHTF9TUkdCX0FMUEhBX0VYVCA9IDB4OEM0MjtcclxuXHJcbnZhciBHTF9IQUxGX0ZMT0FUX09FUyQxID0gMHg4RDYxO1xyXG5cclxudmFyIEdMX0NPTVBSRVNTRURfUkdCX1MzVENfRFhUMV9FWFQgPSAweDgzRjA7XHJcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQxX0VYVCA9IDB4ODNGMTtcclxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDNfRVhUID0gMHg4M0YyO1xyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUNV9FWFQgPSAweDgzRjM7XHJcblxyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JfQVRDX1dFQkdMID0gMHg4QzkyO1xyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19FWFBMSUNJVF9BTFBIQV9XRUJHTCA9IDB4OEM5MztcclxudmFyIEdMX0NPTVBSRVNTRURfUkdCQV9BVENfSU5URVJQT0xBVEVEX0FMUEhBX1dFQkdMID0gMHg4N0VFO1xyXG5cclxudmFyIEdMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzRCUFBWMV9JTUcgPSAweDhDMDA7XHJcbnZhciBHTF9DT01QUkVTU0VEX1JHQl9QVlJUQ18yQlBQVjFfSU1HID0gMHg4QzAxO1xyXG52YXIgR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzRCUFBWMV9JTUcgPSAweDhDMDI7XHJcbnZhciBHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfMkJQUFYxX0lNRyA9IDB4OEMwMztcclxuXHJcbnZhciBHTF9DT01QUkVTU0VEX1JHQl9FVEMxX1dFQkdMID0gMHg4RDY0O1xyXG5cclxudmFyIEdMX1VOU0lHTkVEX0JZVEUkNSA9IDB4MTQwMTtcclxudmFyIEdMX1VOU0lHTkVEX1NIT1JUJDMgPSAweDE0MDM7XHJcbnZhciBHTF9VTlNJR05FRF9JTlQkMyA9IDB4MTQwNTtcclxudmFyIEdMX0ZMT0FUJDQgPSAweDE0MDY7XHJcblxyXG52YXIgR0xfVEVYVFVSRV9XUkFQX1MgPSAweDI4MDI7XHJcbnZhciBHTF9URVhUVVJFX1dSQVBfVCA9IDB4MjgwMztcclxuXHJcbnZhciBHTF9SRVBFQVQgPSAweDI5MDE7XHJcbnZhciBHTF9DTEFNUF9UT19FREdFJDEgPSAweDgxMkY7XHJcbnZhciBHTF9NSVJST1JFRF9SRVBFQVQgPSAweDgzNzA7XHJcblxyXG52YXIgR0xfVEVYVFVSRV9NQUdfRklMVEVSID0gMHgyODAwO1xyXG52YXIgR0xfVEVYVFVSRV9NSU5fRklMVEVSID0gMHgyODAxO1xyXG5cclxudmFyIEdMX05FQVJFU1QkMSA9IDB4MjYwMDtcclxudmFyIEdMX0xJTkVBUiA9IDB4MjYwMTtcclxudmFyIEdMX05FQVJFU1RfTUlQTUFQX05FQVJFU1QkMSA9IDB4MjcwMDtcclxudmFyIEdMX0xJTkVBUl9NSVBNQVBfTkVBUkVTVCQxID0gMHgyNzAxO1xyXG52YXIgR0xfTkVBUkVTVF9NSVBNQVBfTElORUFSJDEgPSAweDI3MDI7XHJcbnZhciBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUiQxID0gMHgyNzAzO1xyXG5cclxudmFyIEdMX0dFTkVSQVRFX01JUE1BUF9ISU5UID0gMHg4MTkyO1xyXG52YXIgR0xfRE9OVF9DQVJFID0gMHgxMTAwO1xyXG52YXIgR0xfRkFTVEVTVCA9IDB4MTEwMTtcclxudmFyIEdMX05JQ0VTVCA9IDB4MTEwMjtcclxuXHJcbnZhciBHTF9URVhUVVJFX01BWF9BTklTT1RST1BZX0VYVCA9IDB4ODRGRTtcclxuXHJcbnZhciBHTF9VTlBBQ0tfQUxJR05NRU5UID0gMHgwQ0Y1O1xyXG52YXIgR0xfVU5QQUNLX0ZMSVBfWV9XRUJHTCA9IDB4OTI0MDtcclxudmFyIEdMX1VOUEFDS19QUkVNVUxUSVBMWV9BTFBIQV9XRUJHTCA9IDB4OTI0MTtcclxudmFyIEdMX1VOUEFDS19DT0xPUlNQQUNFX0NPTlZFUlNJT05fV0VCR0wgPSAweDkyNDM7XHJcblxyXG52YXIgR0xfQlJPV1NFUl9ERUZBVUxUX1dFQkdMID0gMHg5MjQ0O1xyXG5cclxudmFyIEdMX1RFWFRVUkUwJDEgPSAweDg0QzA7XHJcblxyXG52YXIgTUlQTUFQX0ZJTFRFUlMgPSBbXHJcbiAgR0xfTkVBUkVTVF9NSVBNQVBfTkVBUkVTVCQxLFxyXG4gIEdMX05FQVJFU1RfTUlQTUFQX0xJTkVBUiQxLFxyXG4gIEdMX0xJTkVBUl9NSVBNQVBfTkVBUkVTVCQxLFxyXG4gIEdMX0xJTkVBUl9NSVBNQVBfTElORUFSJDFcclxuXTtcclxuXHJcbnZhciBDSEFOTkVMU19GT1JNQVQgPSBbXHJcbiAgMCxcclxuICBHTF9MVU1JTkFOQ0UsXHJcbiAgR0xfTFVNSU5BTkNFX0FMUEhBLFxyXG4gIEdMX1JHQixcclxuICBHTF9SR0JBJDFcclxuXTtcclxuXHJcbnZhciBGT1JNQVRfQ0hBTk5FTFMgPSB7fTtcclxuRk9STUFUX0NIQU5ORUxTW0dMX0xVTUlOQU5DRV0gPVxyXG5GT1JNQVRfQ0hBTk5FTFNbR0xfQUxQSEFdID1cclxuRk9STUFUX0NIQU5ORUxTW0dMX0RFUFRIX0NPTVBPTkVOVF0gPSAxO1xyXG5GT1JNQVRfQ0hBTk5FTFNbR0xfREVQVEhfU1RFTkNJTF0gPVxyXG5GT1JNQVRfQ0hBTk5FTFNbR0xfTFVNSU5BTkNFX0FMUEhBXSA9IDI7XHJcbkZPUk1BVF9DSEFOTkVMU1tHTF9SR0JdID1cclxuRk9STUFUX0NIQU5ORUxTW0dMX1NSR0JfRVhUXSA9IDM7XHJcbkZPUk1BVF9DSEFOTkVMU1tHTF9SR0JBJDFdID1cclxuRk9STUFUX0NIQU5ORUxTW0dMX1NSR0JfQUxQSEFfRVhUXSA9IDQ7XHJcblxyXG5mdW5jdGlvbiBvYmplY3ROYW1lIChzdHIpIHtcclxuICByZXR1cm4gJ1tvYmplY3QgJyArIHN0ciArICddJ1xyXG59XHJcblxyXG52YXIgQ0FOVkFTX0NMQVNTID0gb2JqZWN0TmFtZSgnSFRNTENhbnZhc0VsZW1lbnQnKTtcclxudmFyIENPTlRFWFQyRF9DTEFTUyA9IG9iamVjdE5hbWUoJ0NhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCcpO1xyXG52YXIgQklUTUFQX0NMQVNTID0gb2JqZWN0TmFtZSgnSW1hZ2VCaXRtYXAnKTtcclxudmFyIElNQUdFX0NMQVNTID0gb2JqZWN0TmFtZSgnSFRNTEltYWdlRWxlbWVudCcpO1xyXG52YXIgVklERU9fQ0xBU1MgPSBvYmplY3ROYW1lKCdIVE1MVmlkZW9FbGVtZW50Jyk7XHJcblxyXG52YXIgUElYRUxfQ0xBU1NFUyA9IE9iamVjdC5rZXlzKGFycmF5VHlwZXMpLmNvbmNhdChbXHJcbiAgQ0FOVkFTX0NMQVNTLFxyXG4gIENPTlRFWFQyRF9DTEFTUyxcclxuICBCSVRNQVBfQ0xBU1MsXHJcbiAgSU1BR0VfQ0xBU1MsXHJcbiAgVklERU9fQ0xBU1NcclxuXSk7XHJcblxyXG4vLyBmb3IgZXZlcnkgdGV4dHVyZSB0eXBlLCBzdG9yZVxyXG4vLyB0aGUgc2l6ZSBpbiBieXRlcy5cclxudmFyIFRZUEVfU0laRVMgPSBbXTtcclxuVFlQRV9TSVpFU1tHTF9VTlNJR05FRF9CWVRFJDVdID0gMTtcclxuVFlQRV9TSVpFU1tHTF9GTE9BVCQ0XSA9IDQ7XHJcblRZUEVfU0laRVNbR0xfSEFMRl9GTE9BVF9PRVMkMV0gPSAyO1xyXG5cclxuVFlQRV9TSVpFU1tHTF9VTlNJR05FRF9TSE9SVCQzXSA9IDI7XHJcblRZUEVfU0laRVNbR0xfVU5TSUdORURfSU5UJDNdID0gNDtcclxuXHJcbnZhciBGT1JNQVRfU0laRVNfU1BFQ0lBTCA9IFtdO1xyXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9SR0JBNF0gPSAyO1xyXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9SR0I1X0ExXSA9IDI7XHJcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX1JHQjU2NV0gPSAyO1xyXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9ERVBUSF9TVEVOQ0lMXSA9IDQ7XHJcblxyXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQl9TM1RDX0RYVDFfRVhUXSA9IDAuNTtcclxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUMV9FWFRdID0gMC41O1xyXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQzX0VYVF0gPSAxO1xyXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQ1X0VYVF0gPSAxO1xyXG5cclxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JfQVRDX1dFQkdMXSA9IDAuNTtcclxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19FWFBMSUNJVF9BTFBIQV9XRUJHTF0gPSAxO1xyXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQkFfQVRDX0lOVEVSUE9MQVRFRF9BTFBIQV9XRUJHTF0gPSAxO1xyXG5cclxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfNEJQUFYxX0lNR10gPSAwLjU7XHJcbkZPUk1BVF9TSVpFU19TUEVDSUFMW0dMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzJCUFBWMV9JTUddID0gMC4yNTtcclxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzRCUFBWMV9JTUddID0gMC41O1xyXG5GT1JNQVRfU0laRVNfU1BFQ0lBTFtHTF9DT01QUkVTU0VEX1JHQkFfUFZSVENfMkJQUFYxX0lNR10gPSAwLjI1O1xyXG5cclxuRk9STUFUX1NJWkVTX1NQRUNJQUxbR0xfQ09NUFJFU1NFRF9SR0JfRVRDMV9XRUJHTF0gPSAwLjU7XHJcblxyXG5mdW5jdGlvbiBpc051bWVyaWNBcnJheSAoYXJyKSB7XHJcbiAgcmV0dXJuIChcclxuICAgIEFycmF5LmlzQXJyYXkoYXJyKSAmJlxyXG4gICAgKGFyci5sZW5ndGggPT09IDAgfHxcclxuICAgIHR5cGVvZiBhcnJbMF0gPT09ICdudW1iZXInKSlcclxufVxyXG5cclxuZnVuY3Rpb24gaXNSZWN0QXJyYXkgKGFycikge1xyXG4gIGlmICghQXJyYXkuaXNBcnJheShhcnIpKSB7XHJcbiAgICByZXR1cm4gZmFsc2VcclxuICB9XHJcbiAgdmFyIHdpZHRoID0gYXJyLmxlbmd0aDtcclxuICBpZiAod2lkdGggPT09IDAgfHwgIWlzQXJyYXlMaWtlKGFyclswXSkpIHtcclxuICAgIHJldHVybiBmYWxzZVxyXG4gIH1cclxuICByZXR1cm4gdHJ1ZVxyXG59XHJcblxyXG5mdW5jdGlvbiBjbGFzc1N0cmluZyAoeCkge1xyXG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeClcclxufVxyXG5cclxuZnVuY3Rpb24gaXNDYW52YXNFbGVtZW50IChvYmplY3QpIHtcclxuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gQ0FOVkFTX0NMQVNTXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzQ29udGV4dDJEIChvYmplY3QpIHtcclxuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gQ09OVEVYVDJEX0NMQVNTXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzQml0bWFwIChvYmplY3QpIHtcclxuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gQklUTUFQX0NMQVNTXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzSW1hZ2VFbGVtZW50IChvYmplY3QpIHtcclxuICByZXR1cm4gY2xhc3NTdHJpbmcob2JqZWN0KSA9PT0gSU1BR0VfQ0xBU1NcclxufVxyXG5cclxuZnVuY3Rpb24gaXNWaWRlb0VsZW1lbnQgKG9iamVjdCkge1xyXG4gIHJldHVybiBjbGFzc1N0cmluZyhvYmplY3QpID09PSBWSURFT19DTEFTU1xyXG59XHJcblxyXG5mdW5jdGlvbiBpc1BpeGVsRGF0YSAob2JqZWN0KSB7XHJcbiAgaWYgKCFvYmplY3QpIHtcclxuICAgIHJldHVybiBmYWxzZVxyXG4gIH1cclxuICB2YXIgY2xhc3NOYW1lID0gY2xhc3NTdHJpbmcob2JqZWN0KTtcclxuICBpZiAoUElYRUxfQ0xBU1NFUy5pbmRleE9mKGNsYXNzTmFtZSkgPj0gMCkge1xyXG4gICAgcmV0dXJuIHRydWVcclxuICB9XHJcbiAgcmV0dXJuIChcclxuICAgIGlzTnVtZXJpY0FycmF5KG9iamVjdCkgfHxcclxuICAgIGlzUmVjdEFycmF5KG9iamVjdCkgfHxcclxuICAgIGlzTkRBcnJheUxpa2Uob2JqZWN0KSlcclxufVxyXG5cclxuZnVuY3Rpb24gdHlwZWRBcnJheUNvZGUkMSAoZGF0YSkge1xyXG4gIHJldHVybiBhcnJheVR5cGVzW09iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChkYXRhKV0gfCAwXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNvbnZlcnREYXRhIChyZXN1bHQsIGRhdGEpIHtcclxuICB2YXIgbiA9IGRhdGEubGVuZ3RoO1xyXG4gIHN3aXRjaCAocmVzdWx0LnR5cGUpIHtcclxuICAgIGNhc2UgR0xfVU5TSUdORURfQllURSQ1OlxyXG4gICAgY2FzZSBHTF9VTlNJR05FRF9TSE9SVCQzOlxyXG4gICAgY2FzZSBHTF9VTlNJR05FRF9JTlQkMzpcclxuICAgIGNhc2UgR0xfRkxPQVQkNDpcclxuICAgICAgdmFyIGNvbnZlcnRlZCA9IHBvb2wuYWxsb2NUeXBlKHJlc3VsdC50eXBlLCBuKTtcclxuICAgICAgY29udmVydGVkLnNldChkYXRhKTtcclxuICAgICAgcmVzdWx0LmRhdGEgPSBjb252ZXJ0ZWQ7XHJcbiAgICAgIGJyZWFrXHJcblxyXG4gICAgY2FzZSBHTF9IQUxGX0ZMT0FUX09FUyQxOlxyXG4gICAgICByZXN1bHQuZGF0YSA9IGNvbnZlcnRUb0hhbGZGbG9hdChkYXRhKTtcclxuICAgICAgYnJlYWtcclxuXHJcbiAgICBkZWZhdWx0OlxyXG4gICAgICBjaGVjayQxLnJhaXNlKCd1bnN1cHBvcnRlZCB0ZXh0dXJlIHR5cGUsIG11c3Qgc3BlY2lmeSBhIHR5cGVkIGFycmF5Jyk7XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBwcmVDb252ZXJ0IChpbWFnZSwgbikge1xyXG4gIHJldHVybiBwb29sLmFsbG9jVHlwZShcclxuICAgIGltYWdlLnR5cGUgPT09IEdMX0hBTEZfRkxPQVRfT0VTJDFcclxuICAgICAgPyBHTF9GTE9BVCQ0XHJcbiAgICAgIDogaW1hZ2UudHlwZSwgbilcclxufVxyXG5cclxuZnVuY3Rpb24gcG9zdENvbnZlcnQgKGltYWdlLCBkYXRhKSB7XHJcbiAgaWYgKGltYWdlLnR5cGUgPT09IEdMX0hBTEZfRkxPQVRfT0VTJDEpIHtcclxuICAgIGltYWdlLmRhdGEgPSBjb252ZXJ0VG9IYWxmRmxvYXQoZGF0YSk7XHJcbiAgICBwb29sLmZyZWVUeXBlKGRhdGEpO1xyXG4gIH0gZWxzZSB7XHJcbiAgICBpbWFnZS5kYXRhID0gZGF0YTtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHRyYW5zcG9zZURhdGEgKGltYWdlLCBhcnJheSwgc3RyaWRlWCwgc3RyaWRlWSwgc3RyaWRlQywgb2Zmc2V0KSB7XHJcbiAgdmFyIHcgPSBpbWFnZS53aWR0aDtcclxuICB2YXIgaCA9IGltYWdlLmhlaWdodDtcclxuICB2YXIgYyA9IGltYWdlLmNoYW5uZWxzO1xyXG4gIHZhciBuID0gdyAqIGggKiBjO1xyXG4gIHZhciBkYXRhID0gcHJlQ29udmVydChpbWFnZSwgbik7XHJcblxyXG4gIHZhciBwID0gMDtcclxuICBmb3IgKHZhciBpID0gMDsgaSA8IGg7ICsraSkge1xyXG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCB3OyArK2opIHtcclxuICAgICAgZm9yICh2YXIgayA9IDA7IGsgPCBjOyArK2spIHtcclxuICAgICAgICBkYXRhW3ArK10gPSBhcnJheVtzdHJpZGVYICogaiArIHN0cmlkZVkgKiBpICsgc3RyaWRlQyAqIGsgKyBvZmZzZXRdO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwb3N0Q29udmVydChpbWFnZSwgZGF0YSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldFRleHR1cmVTaXplIChmb3JtYXQsIHR5cGUsIHdpZHRoLCBoZWlnaHQsIGlzTWlwbWFwLCBpc0N1YmUpIHtcclxuICB2YXIgcztcclxuICBpZiAodHlwZW9mIEZPUk1BVF9TSVpFU19TUEVDSUFMW2Zvcm1hdF0gIT09ICd1bmRlZmluZWQnKSB7XHJcbiAgICAvLyB3ZSBoYXZlIGEgc3BlY2lhbCBhcnJheSBmb3IgZGVhbGluZyB3aXRoIHdlaXJkIGNvbG9yIGZvcm1hdHMgc3VjaCBhcyBSR0I1QTFcclxuICAgIHMgPSBGT1JNQVRfU0laRVNfU1BFQ0lBTFtmb3JtYXRdO1xyXG4gIH0gZWxzZSB7XHJcbiAgICBzID0gRk9STUFUX0NIQU5ORUxTW2Zvcm1hdF0gKiBUWVBFX1NJWkVTW3R5cGVdO1xyXG4gIH1cclxuXHJcbiAgaWYgKGlzQ3ViZSkge1xyXG4gICAgcyAqPSA2O1xyXG4gIH1cclxuXHJcbiAgaWYgKGlzTWlwbWFwKSB7XHJcbiAgICAvLyBjb21wdXRlIHRoZSB0b3RhbCBzaXplIG9mIGFsbCB0aGUgbWlwbWFwcy5cclxuICAgIHZhciB0b3RhbCA9IDA7XHJcblxyXG4gICAgdmFyIHcgPSB3aWR0aDtcclxuICAgIHdoaWxlICh3ID49IDEpIHtcclxuICAgICAgLy8gd2UgY2FuIG9ubHkgdXNlIG1pcG1hcHMgb24gYSBzcXVhcmUgaW1hZ2UsXHJcbiAgICAgIC8vIHNvIHdlIGNhbiBzaW1wbHkgdXNlIHRoZSB3aWR0aCBhbmQgaWdub3JlIHRoZSBoZWlnaHQ6XHJcbiAgICAgIHRvdGFsICs9IHMgKiB3ICogdztcclxuICAgICAgdyAvPSAyO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRvdGFsXHJcbiAgfSBlbHNlIHtcclxuICAgIHJldHVybiBzICogd2lkdGggKiBoZWlnaHRcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZVRleHR1cmVTZXQgKFxyXG4gIGdsLCBleHRlbnNpb25zLCBsaW1pdHMsIHJlZ2xQb2xsLCBjb250ZXh0U3RhdGUsIHN0YXRzLCBjb25maWcpIHtcclxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgLy8gSW5pdGlhbGl6ZSBjb25zdGFudHMgYW5kIHBhcmFtZXRlciB0YWJsZXMgaGVyZVxyXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICB2YXIgbWlwbWFwSGludCA9IHtcclxuICAgIFwiZG9uJ3QgY2FyZVwiOiBHTF9ET05UX0NBUkUsXHJcbiAgICAnZG9udCBjYXJlJzogR0xfRE9OVF9DQVJFLFxyXG4gICAgJ25pY2UnOiBHTF9OSUNFU1QsXHJcbiAgICAnZmFzdCc6IEdMX0ZBU1RFU1RcclxuICB9O1xyXG5cclxuICB2YXIgd3JhcE1vZGVzID0ge1xyXG4gICAgJ3JlcGVhdCc6IEdMX1JFUEVBVCxcclxuICAgICdjbGFtcCc6IEdMX0NMQU1QX1RPX0VER0UkMSxcclxuICAgICdtaXJyb3InOiBHTF9NSVJST1JFRF9SRVBFQVRcclxuICB9O1xyXG5cclxuICB2YXIgbWFnRmlsdGVycyA9IHtcclxuICAgICduZWFyZXN0JzogR0xfTkVBUkVTVCQxLFxyXG4gICAgJ2xpbmVhcic6IEdMX0xJTkVBUlxyXG4gIH07XHJcblxyXG4gIHZhciBtaW5GaWx0ZXJzID0gZXh0ZW5kKHtcclxuICAgICdtaXBtYXAnOiBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUiQxLFxyXG4gICAgJ25lYXJlc3QgbWlwbWFwIG5lYXJlc3QnOiBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNUJDEsXHJcbiAgICAnbGluZWFyIG1pcG1hcCBuZWFyZXN0JzogR0xfTElORUFSX01JUE1BUF9ORUFSRVNUJDEsXHJcbiAgICAnbmVhcmVzdCBtaXBtYXAgbGluZWFyJzogR0xfTkVBUkVTVF9NSVBNQVBfTElORUFSJDEsXHJcbiAgICAnbGluZWFyIG1pcG1hcCBsaW5lYXInOiBHTF9MSU5FQVJfTUlQTUFQX0xJTkVBUiQxXHJcbiAgfSwgbWFnRmlsdGVycyk7XHJcblxyXG4gIHZhciBjb2xvclNwYWNlID0ge1xyXG4gICAgJ25vbmUnOiAwLFxyXG4gICAgJ2Jyb3dzZXInOiBHTF9CUk9XU0VSX0RFRkFVTFRfV0VCR0xcclxuICB9O1xyXG5cclxuICB2YXIgdGV4dHVyZVR5cGVzID0ge1xyXG4gICAgJ3VpbnQ4JzogR0xfVU5TSUdORURfQllURSQ1LFxyXG4gICAgJ3JnYmE0JzogR0xfVU5TSUdORURfU0hPUlRfNF80XzRfNCQxLFxyXG4gICAgJ3JnYjU2NSc6IEdMX1VOU0lHTkVEX1NIT1JUXzVfNl81JDEsXHJcbiAgICAncmdiNSBhMSc6IEdMX1VOU0lHTkVEX1NIT1JUXzVfNV81XzEkMVxyXG4gIH07XHJcblxyXG4gIHZhciB0ZXh0dXJlRm9ybWF0cyA9IHtcclxuICAgICdhbHBoYSc6IEdMX0FMUEhBLFxyXG4gICAgJ2x1bWluYW5jZSc6IEdMX0xVTUlOQU5DRSxcclxuICAgICdsdW1pbmFuY2UgYWxwaGEnOiBHTF9MVU1JTkFOQ0VfQUxQSEEsXHJcbiAgICAncmdiJzogR0xfUkdCLFxyXG4gICAgJ3JnYmEnOiBHTF9SR0JBJDEsXHJcbiAgICAncmdiYTQnOiBHTF9SR0JBNCxcclxuICAgICdyZ2I1IGExJzogR0xfUkdCNV9BMSxcclxuICAgICdyZ2I1NjUnOiBHTF9SR0I1NjVcclxuICB9O1xyXG5cclxuICB2YXIgY29tcHJlc3NlZFRleHR1cmVGb3JtYXRzID0ge307XHJcblxyXG4gIGlmIChleHRlbnNpb25zLmV4dF9zcmdiKSB7XHJcbiAgICB0ZXh0dXJlRm9ybWF0cy5zcmdiID0gR0xfU1JHQl9FWFQ7XHJcbiAgICB0ZXh0dXJlRm9ybWF0cy5zcmdiYSA9IEdMX1NSR0JfQUxQSEFfRVhUO1xyXG4gIH1cclxuXHJcbiAgaWYgKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfZmxvYXQpIHtcclxuICAgIHRleHR1cmVUeXBlcy5mbG9hdDMyID0gdGV4dHVyZVR5cGVzLmZsb2F0ID0gR0xfRkxPQVQkNDtcclxuICB9XHJcblxyXG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2hhbGZfZmxvYXQpIHtcclxuICAgIHRleHR1cmVUeXBlc1snZmxvYXQxNiddID0gdGV4dHVyZVR5cGVzWydoYWxmIGZsb2F0J10gPSBHTF9IQUxGX0ZMT0FUX09FUyQxO1xyXG4gIH1cclxuXHJcbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfZGVwdGhfdGV4dHVyZSkge1xyXG4gICAgZXh0ZW5kKHRleHR1cmVGb3JtYXRzLCB7XHJcbiAgICAgICdkZXB0aCc6IEdMX0RFUFRIX0NPTVBPTkVOVCxcclxuICAgICAgJ2RlcHRoIHN0ZW5jaWwnOiBHTF9ERVBUSF9TVEVOQ0lMXHJcbiAgICB9KTtcclxuXHJcbiAgICBleHRlbmQodGV4dHVyZVR5cGVzLCB7XHJcbiAgICAgICd1aW50MTYnOiBHTF9VTlNJR05FRF9TSE9SVCQzLFxyXG4gICAgICAndWludDMyJzogR0xfVU5TSUdORURfSU5UJDMsXHJcbiAgICAgICdkZXB0aCBzdGVuY2lsJzogR0xfVU5TSUdORURfSU5UXzI0XzhfV0VCR0wkMVxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBpZiAoZXh0ZW5zaW9ucy53ZWJnbF9jb21wcmVzc2VkX3RleHR1cmVfczN0Yykge1xyXG4gICAgZXh0ZW5kKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cywge1xyXG4gICAgICAncmdiIHMzdGMgZHh0MSc6IEdMX0NPTVBSRVNTRURfUkdCX1MzVENfRFhUMV9FWFQsXHJcbiAgICAgICdyZ2JhIHMzdGMgZHh0MSc6IEdMX0NPTVBSRVNTRURfUkdCQV9TM1RDX0RYVDFfRVhULFxyXG4gICAgICAncmdiYSBzM3RjIGR4dDMnOiBHTF9DT01QUkVTU0VEX1JHQkFfUzNUQ19EWFQzX0VYVCxcclxuICAgICAgJ3JnYmEgczN0YyBkeHQ1JzogR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUNV9FWFRcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgaWYgKGV4dGVuc2lvbnMud2ViZ2xfY29tcHJlc3NlZF90ZXh0dXJlX2F0Yykge1xyXG4gICAgZXh0ZW5kKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cywge1xyXG4gICAgICAncmdiIGF0Yyc6IEdMX0NPTVBSRVNTRURfUkdCX0FUQ19XRUJHTCxcclxuICAgICAgJ3JnYmEgYXRjIGV4cGxpY2l0IGFscGhhJzogR0xfQ09NUFJFU1NFRF9SR0JBX0FUQ19FWFBMSUNJVF9BTFBIQV9XRUJHTCxcclxuICAgICAgJ3JnYmEgYXRjIGludGVycG9sYXRlZCBhbHBoYSc6IEdMX0NPTVBSRVNTRURfUkdCQV9BVENfSU5URVJQT0xBVEVEX0FMUEhBX1dFQkdMXHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9wdnJ0Yykge1xyXG4gICAgZXh0ZW5kKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cywge1xyXG4gICAgICAncmdiIHB2cnRjIDRicHB2MSc6IEdMX0NPTVBSRVNTRURfUkdCX1BWUlRDXzRCUFBWMV9JTUcsXHJcbiAgICAgICdyZ2IgcHZydGMgMmJwcHYxJzogR0xfQ09NUFJFU1NFRF9SR0JfUFZSVENfMkJQUFYxX0lNRyxcclxuICAgICAgJ3JnYmEgcHZydGMgNGJwcHYxJzogR0xfQ09NUFJFU1NFRF9SR0JBX1BWUlRDXzRCUFBWMV9JTUcsXHJcbiAgICAgICdyZ2JhIHB2cnRjIDJicHB2MSc6IEdMX0NPTVBSRVNTRURfUkdCQV9QVlJUQ18yQlBQVjFfSU1HXHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbXByZXNzZWRfdGV4dHVyZV9ldGMxKSB7XHJcbiAgICBjb21wcmVzc2VkVGV4dHVyZUZvcm1hdHNbJ3JnYiBldGMxJ10gPSBHTF9DT01QUkVTU0VEX1JHQl9FVEMxX1dFQkdMO1xyXG4gIH1cclxuXHJcbiAgLy8gQ29weSBvdmVyIGFsbCB0ZXh0dXJlIGZvcm1hdHNcclxuICB2YXIgc3VwcG9ydGVkQ29tcHJlc3NlZEZvcm1hdHMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChcclxuICAgIGdsLmdldFBhcmFtZXRlcihHTF9DT01QUkVTU0VEX1RFWFRVUkVfRk9STUFUUykpO1xyXG4gIE9iamVjdC5rZXlzKGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xyXG4gICAgdmFyIGZvcm1hdCA9IGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0c1tuYW1lXTtcclxuICAgIGlmIChzdXBwb3J0ZWRDb21wcmVzc2VkRm9ybWF0cy5pbmRleE9mKGZvcm1hdCkgPj0gMCkge1xyXG4gICAgICB0ZXh0dXJlRm9ybWF0c1tuYW1lXSA9IGZvcm1hdDtcclxuICAgIH1cclxuICB9KTtcclxuXHJcbiAgdmFyIHN1cHBvcnRlZEZvcm1hdHMgPSBPYmplY3Qua2V5cyh0ZXh0dXJlRm9ybWF0cyk7XHJcbiAgbGltaXRzLnRleHR1cmVGb3JtYXRzID0gc3VwcG9ydGVkRm9ybWF0cztcclxuXHJcbiAgLy8gYXNzb2NpYXRlIHdpdGggZXZlcnkgZm9ybWF0IHN0cmluZyBpdHNcclxuICAvLyBjb3JyZXNwb25kaW5nIEdMLXZhbHVlLlxyXG4gIHZhciB0ZXh0dXJlRm9ybWF0c0ludmVydCA9IFtdO1xyXG4gIE9iamVjdC5rZXlzKHRleHR1cmVGb3JtYXRzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcclxuICAgIHZhciB2YWwgPSB0ZXh0dXJlRm9ybWF0c1trZXldO1xyXG4gICAgdGV4dHVyZUZvcm1hdHNJbnZlcnRbdmFsXSA9IGtleTtcclxuICB9KTtcclxuXHJcbiAgLy8gYXNzb2NpYXRlIHdpdGggZXZlcnkgdHlwZSBzdHJpbmcgaXRzXHJcbiAgLy8gY29ycmVzcG9uZGluZyBHTC12YWx1ZS5cclxuICB2YXIgdGV4dHVyZVR5cGVzSW52ZXJ0ID0gW107XHJcbiAgT2JqZWN0LmtleXModGV4dHVyZVR5cGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcclxuICAgIHZhciB2YWwgPSB0ZXh0dXJlVHlwZXNba2V5XTtcclxuICAgIHRleHR1cmVUeXBlc0ludmVydFt2YWxdID0ga2V5O1xyXG4gIH0pO1xyXG5cclxuICB2YXIgbWFnRmlsdGVyc0ludmVydCA9IFtdO1xyXG4gIE9iamVjdC5rZXlzKG1hZ0ZpbHRlcnMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xyXG4gICAgdmFyIHZhbCA9IG1hZ0ZpbHRlcnNba2V5XTtcclxuICAgIG1hZ0ZpbHRlcnNJbnZlcnRbdmFsXSA9IGtleTtcclxuICB9KTtcclxuXHJcbiAgdmFyIG1pbkZpbHRlcnNJbnZlcnQgPSBbXTtcclxuICBPYmplY3Qua2V5cyhtaW5GaWx0ZXJzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcclxuICAgIHZhciB2YWwgPSBtaW5GaWx0ZXJzW2tleV07XHJcbiAgICBtaW5GaWx0ZXJzSW52ZXJ0W3ZhbF0gPSBrZXk7XHJcbiAgfSk7XHJcblxyXG4gIHZhciB3cmFwTW9kZXNJbnZlcnQgPSBbXTtcclxuICBPYmplY3Qua2V5cyh3cmFwTW9kZXMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xyXG4gICAgdmFyIHZhbCA9IHdyYXBNb2Rlc1trZXldO1xyXG4gICAgd3JhcE1vZGVzSW52ZXJ0W3ZhbF0gPSBrZXk7XHJcbiAgfSk7XHJcblxyXG4gIC8vIGNvbG9yRm9ybWF0c1tdIGdpdmVzIHRoZSBmb3JtYXQgKGNoYW5uZWxzKSBhc3NvY2lhdGVkIHRvIGFuXHJcbiAgLy8gaW50ZXJuYWxmb3JtYXRcclxuICB2YXIgY29sb3JGb3JtYXRzID0gc3VwcG9ydGVkRm9ybWF0cy5yZWR1Y2UoZnVuY3Rpb24gKGNvbG9yLCBrZXkpIHtcclxuICAgIHZhciBnbGVudW0gPSB0ZXh0dXJlRm9ybWF0c1trZXldO1xyXG4gICAgaWYgKGdsZW51bSA9PT0gR0xfTFVNSU5BTkNFIHx8XHJcbiAgICAgICAgZ2xlbnVtID09PSBHTF9BTFBIQSB8fFxyXG4gICAgICAgIGdsZW51bSA9PT0gR0xfTFVNSU5BTkNFIHx8XHJcbiAgICAgICAgZ2xlbnVtID09PSBHTF9MVU1JTkFOQ0VfQUxQSEEgfHxcclxuICAgICAgICBnbGVudW0gPT09IEdMX0RFUFRIX0NPTVBPTkVOVCB8fFxyXG4gICAgICAgIGdsZW51bSA9PT0gR0xfREVQVEhfU1RFTkNJTCkge1xyXG4gICAgICBjb2xvcltnbGVudW1dID0gZ2xlbnVtO1xyXG4gICAgfSBlbHNlIGlmIChnbGVudW0gPT09IEdMX1JHQjVfQTEgfHwga2V5LmluZGV4T2YoJ3JnYmEnKSA+PSAwKSB7XHJcbiAgICAgIGNvbG9yW2dsZW51bV0gPSBHTF9SR0JBJDE7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBjb2xvcltnbGVudW1dID0gR0xfUkdCO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGNvbG9yXHJcbiAgfSwge30pO1xyXG5cclxuICBmdW5jdGlvbiBUZXhGbGFncyAoKSB7XHJcbiAgICAvLyBmb3JtYXQgaW5mb1xyXG4gICAgdGhpcy5pbnRlcm5hbGZvcm1hdCA9IEdMX1JHQkEkMTtcclxuICAgIHRoaXMuZm9ybWF0ID0gR0xfUkdCQSQxO1xyXG4gICAgdGhpcy50eXBlID0gR0xfVU5TSUdORURfQllURSQ1O1xyXG4gICAgdGhpcy5jb21wcmVzc2VkID0gZmFsc2U7XHJcblxyXG4gICAgLy8gcGl4ZWwgc3RvcmFnZVxyXG4gICAgdGhpcy5wcmVtdWx0aXBseUFscGhhID0gZmFsc2U7XHJcbiAgICB0aGlzLmZsaXBZID0gZmFsc2U7XHJcbiAgICB0aGlzLnVucGFja0FsaWdubWVudCA9IDE7XHJcbiAgICB0aGlzLmNvbG9yU3BhY2UgPSBHTF9CUk9XU0VSX0RFRkFVTFRfV0VCR0w7XHJcblxyXG4gICAgLy8gc2hhcGUgaW5mb1xyXG4gICAgdGhpcy53aWR0aCA9IDA7XHJcbiAgICB0aGlzLmhlaWdodCA9IDA7XHJcbiAgICB0aGlzLmNoYW5uZWxzID0gMDtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGNvcHlGbGFncyAocmVzdWx0LCBvdGhlcikge1xyXG4gICAgcmVzdWx0LmludGVybmFsZm9ybWF0ID0gb3RoZXIuaW50ZXJuYWxmb3JtYXQ7XHJcbiAgICByZXN1bHQuZm9ybWF0ID0gb3RoZXIuZm9ybWF0O1xyXG4gICAgcmVzdWx0LnR5cGUgPSBvdGhlci50eXBlO1xyXG4gICAgcmVzdWx0LmNvbXByZXNzZWQgPSBvdGhlci5jb21wcmVzc2VkO1xyXG5cclxuICAgIHJlc3VsdC5wcmVtdWx0aXBseUFscGhhID0gb3RoZXIucHJlbXVsdGlwbHlBbHBoYTtcclxuICAgIHJlc3VsdC5mbGlwWSA9IG90aGVyLmZsaXBZO1xyXG4gICAgcmVzdWx0LnVucGFja0FsaWdubWVudCA9IG90aGVyLnVucGFja0FsaWdubWVudDtcclxuICAgIHJlc3VsdC5jb2xvclNwYWNlID0gb3RoZXIuY29sb3JTcGFjZTtcclxuXHJcbiAgICByZXN1bHQud2lkdGggPSBvdGhlci53aWR0aDtcclxuICAgIHJlc3VsdC5oZWlnaHQgPSBvdGhlci5oZWlnaHQ7XHJcbiAgICByZXN1bHQuY2hhbm5lbHMgPSBvdGhlci5jaGFubmVscztcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHBhcnNlRmxhZ3MgKGZsYWdzLCBvcHRpb25zKSB7XHJcbiAgICBpZiAodHlwZW9mIG9wdGlvbnMgIT09ICdvYmplY3QnIHx8ICFvcHRpb25zKSB7XHJcbiAgICAgIHJldHVyblxyXG4gICAgfVxyXG5cclxuICAgIGlmICgncHJlbXVsdGlwbHlBbHBoYScgaW4gb3B0aW9ucykge1xyXG4gICAgICBjaGVjayQxLnR5cGUob3B0aW9ucy5wcmVtdWx0aXBseUFscGhhLCAnYm9vbGVhbicsXHJcbiAgICAgICAgJ2ludmFsaWQgcHJlbXVsdGlwbHlBbHBoYScpO1xyXG4gICAgICBmbGFncy5wcmVtdWx0aXBseUFscGhhID0gb3B0aW9ucy5wcmVtdWx0aXBseUFscGhhO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICgnZmxpcFknIGluIG9wdGlvbnMpIHtcclxuICAgICAgY2hlY2skMS50eXBlKG9wdGlvbnMuZmxpcFksICdib29sZWFuJyxcclxuICAgICAgICAnaW52YWxpZCB0ZXh0dXJlIGZsaXAnKTtcclxuICAgICAgZmxhZ3MuZmxpcFkgPSBvcHRpb25zLmZsaXBZO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICgnYWxpZ25tZW50JyBpbiBvcHRpb25zKSB7XHJcbiAgICAgIGNoZWNrJDEub25lT2Yob3B0aW9ucy5hbGlnbm1lbnQsIFsxLCAyLCA0LCA4XSxcclxuICAgICAgICAnaW52YWxpZCB0ZXh0dXJlIHVucGFjayBhbGlnbm1lbnQnKTtcclxuICAgICAgZmxhZ3MudW5wYWNrQWxpZ25tZW50ID0gb3B0aW9ucy5hbGlnbm1lbnQ7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCdjb2xvclNwYWNlJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgIGNoZWNrJDEucGFyYW1ldGVyKG9wdGlvbnMuY29sb3JTcGFjZSwgY29sb3JTcGFjZSxcclxuICAgICAgICAnaW52YWxpZCBjb2xvclNwYWNlJyk7XHJcbiAgICAgIGZsYWdzLmNvbG9yU3BhY2UgPSBjb2xvclNwYWNlW29wdGlvbnMuY29sb3JTcGFjZV07XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCd0eXBlJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgIHZhciB0eXBlID0gb3B0aW9ucy50eXBlO1xyXG4gICAgICBjaGVjayQxKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfZmxvYXQgfHxcclxuICAgICAgICAhKHR5cGUgPT09ICdmbG9hdCcgfHwgdHlwZSA9PT0gJ2Zsb2F0MzInKSxcclxuICAgICAgICAneW91IG11c3QgZW5hYmxlIHRoZSBPRVNfdGV4dHVyZV9mbG9hdCBleHRlbnNpb24gaW4gb3JkZXIgdG8gdXNlIGZsb2F0aW5nIHBvaW50IHRleHR1cmVzLicpO1xyXG4gICAgICBjaGVjayQxKGV4dGVuc2lvbnMub2VzX3RleHR1cmVfaGFsZl9mbG9hdCB8fFxyXG4gICAgICAgICEodHlwZSA9PT0gJ2hhbGYgZmxvYXQnIHx8IHR5cGUgPT09ICdmbG9hdDE2JyksXHJcbiAgICAgICAgJ3lvdSBtdXN0IGVuYWJsZSB0aGUgT0VTX3RleHR1cmVfaGFsZl9mbG9hdCBleHRlbnNpb24gaW4gb3JkZXIgdG8gdXNlIDE2LWJpdCBmbG9hdGluZyBwb2ludCB0ZXh0dXJlcy4nKTtcclxuICAgICAgY2hlY2skMShleHRlbnNpb25zLndlYmdsX2RlcHRoX3RleHR1cmUgfHxcclxuICAgICAgICAhKHR5cGUgPT09ICd1aW50MTYnIHx8IHR5cGUgPT09ICd1aW50MzInIHx8IHR5cGUgPT09ICdkZXB0aCBzdGVuY2lsJyksXHJcbiAgICAgICAgJ3lvdSBtdXN0IGVuYWJsZSB0aGUgV0VCR0xfZGVwdGhfdGV4dHVyZSBleHRlbnNpb24gaW4gb3JkZXIgdG8gdXNlIGRlcHRoL3N0ZW5jaWwgdGV4dHVyZXMuJyk7XHJcbiAgICAgIGNoZWNrJDEucGFyYW1ldGVyKHR5cGUsIHRleHR1cmVUeXBlcyxcclxuICAgICAgICAnaW52YWxpZCB0ZXh0dXJlIHR5cGUnKTtcclxuICAgICAgZmxhZ3MudHlwZSA9IHRleHR1cmVUeXBlc1t0eXBlXTtcclxuICAgIH1cclxuXHJcbiAgICB2YXIgdyA9IGZsYWdzLndpZHRoO1xyXG4gICAgdmFyIGggPSBmbGFncy5oZWlnaHQ7XHJcbiAgICB2YXIgYyA9IGZsYWdzLmNoYW5uZWxzO1xyXG4gICAgdmFyIGhhc0NoYW5uZWxzID0gZmFsc2U7XHJcbiAgICBpZiAoJ3NoYXBlJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgIGNoZWNrJDEoQXJyYXkuaXNBcnJheShvcHRpb25zLnNoYXBlKSAmJiBvcHRpb25zLnNoYXBlLmxlbmd0aCA+PSAyLFxyXG4gICAgICAgICdzaGFwZSBtdXN0IGJlIGFuIGFycmF5Jyk7XHJcbiAgICAgIHcgPSBvcHRpb25zLnNoYXBlWzBdO1xyXG4gICAgICBoID0gb3B0aW9ucy5zaGFwZVsxXTtcclxuICAgICAgaWYgKG9wdGlvbnMuc2hhcGUubGVuZ3RoID09PSAzKSB7XHJcbiAgICAgICAgYyA9IG9wdGlvbnMuc2hhcGVbMl07XHJcbiAgICAgICAgY2hlY2skMShjID4gMCAmJiBjIDw9IDQsICdpbnZhbGlkIG51bWJlciBvZiBjaGFubmVscycpO1xyXG4gICAgICAgIGhhc0NoYW5uZWxzID0gdHJ1ZTtcclxuICAgICAgfVxyXG4gICAgICBjaGVjayQxKHcgPj0gMCAmJiB3IDw9IGxpbWl0cy5tYXhUZXh0dXJlU2l6ZSwgJ2ludmFsaWQgd2lkdGgnKTtcclxuICAgICAgY2hlY2skMShoID49IDAgJiYgaCA8PSBsaW1pdHMubWF4VGV4dHVyZVNpemUsICdpbnZhbGlkIGhlaWdodCcpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgaWYgKCdyYWRpdXMnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICB3ID0gaCA9IG9wdGlvbnMucmFkaXVzO1xyXG4gICAgICAgIGNoZWNrJDEodyA+PSAwICYmIHcgPD0gbGltaXRzLm1heFRleHR1cmVTaXplLCAnaW52YWxpZCByYWRpdXMnKTtcclxuICAgICAgfVxyXG4gICAgICBpZiAoJ3dpZHRoJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgdyA9IG9wdGlvbnMud2lkdGg7XHJcbiAgICAgICAgY2hlY2skMSh3ID49IDAgJiYgdyA8PSBsaW1pdHMubWF4VGV4dHVyZVNpemUsICdpbnZhbGlkIHdpZHRoJyk7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICBoID0gb3B0aW9ucy5oZWlnaHQ7XHJcbiAgICAgICAgY2hlY2skMShoID49IDAgJiYgaCA8PSBsaW1pdHMubWF4VGV4dHVyZVNpemUsICdpbnZhbGlkIGhlaWdodCcpO1xyXG4gICAgICB9XHJcbiAgICAgIGlmICgnY2hhbm5lbHMnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICBjID0gb3B0aW9ucy5jaGFubmVscztcclxuICAgICAgICBjaGVjayQxKGMgPiAwICYmIGMgPD0gNCwgJ2ludmFsaWQgbnVtYmVyIG9mIGNoYW5uZWxzJyk7XHJcbiAgICAgICAgaGFzQ2hhbm5lbHMgPSB0cnVlO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBmbGFncy53aWR0aCA9IHcgfCAwO1xyXG4gICAgZmxhZ3MuaGVpZ2h0ID0gaCB8IDA7XHJcbiAgICBmbGFncy5jaGFubmVscyA9IGMgfCAwO1xyXG5cclxuICAgIHZhciBoYXNGb3JtYXQgPSBmYWxzZTtcclxuICAgIGlmICgnZm9ybWF0JyBpbiBvcHRpb25zKSB7XHJcbiAgICAgIHZhciBmb3JtYXRTdHIgPSBvcHRpb25zLmZvcm1hdDtcclxuICAgICAgY2hlY2skMShleHRlbnNpb25zLndlYmdsX2RlcHRoX3RleHR1cmUgfHxcclxuICAgICAgICAhKGZvcm1hdFN0ciA9PT0gJ2RlcHRoJyB8fCBmb3JtYXRTdHIgPT09ICdkZXB0aCBzdGVuY2lsJyksXHJcbiAgICAgICAgJ3lvdSBtdXN0IGVuYWJsZSB0aGUgV0VCR0xfZGVwdGhfdGV4dHVyZSBleHRlbnNpb24gaW4gb3JkZXIgdG8gdXNlIGRlcHRoL3N0ZW5jaWwgdGV4dHVyZXMuJyk7XHJcbiAgICAgIGNoZWNrJDEucGFyYW1ldGVyKGZvcm1hdFN0ciwgdGV4dHVyZUZvcm1hdHMsXHJcbiAgICAgICAgJ2ludmFsaWQgdGV4dHVyZSBmb3JtYXQnKTtcclxuICAgICAgdmFyIGludGVybmFsZm9ybWF0ID0gZmxhZ3MuaW50ZXJuYWxmb3JtYXQgPSB0ZXh0dXJlRm9ybWF0c1tmb3JtYXRTdHJdO1xyXG4gICAgICBmbGFncy5mb3JtYXQgPSBjb2xvckZvcm1hdHNbaW50ZXJuYWxmb3JtYXRdO1xyXG4gICAgICBpZiAoZm9ybWF0U3RyIGluIHRleHR1cmVUeXBlcykge1xyXG4gICAgICAgIGlmICghKCd0eXBlJyBpbiBvcHRpb25zKSkge1xyXG4gICAgICAgICAgZmxhZ3MudHlwZSA9IHRleHR1cmVUeXBlc1tmb3JtYXRTdHJdO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICBpZiAoZm9ybWF0U3RyIGluIGNvbXByZXNzZWRUZXh0dXJlRm9ybWF0cykge1xyXG4gICAgICAgIGZsYWdzLmNvbXByZXNzZWQgPSB0cnVlO1xyXG4gICAgICB9XHJcbiAgICAgIGhhc0Zvcm1hdCA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUmVjb25jaWxlIGNoYW5uZWxzIGFuZCBmb3JtYXRcclxuICAgIGlmICghaGFzQ2hhbm5lbHMgJiYgaGFzRm9ybWF0KSB7XHJcbiAgICAgIGZsYWdzLmNoYW5uZWxzID0gRk9STUFUX0NIQU5ORUxTW2ZsYWdzLmZvcm1hdF07XHJcbiAgICB9IGVsc2UgaWYgKGhhc0NoYW5uZWxzICYmICFoYXNGb3JtYXQpIHtcclxuICAgICAgaWYgKGZsYWdzLmNoYW5uZWxzICE9PSBDSEFOTkVMU19GT1JNQVRbZmxhZ3MuZm9ybWF0XSkge1xyXG4gICAgICAgIGZsYWdzLmZvcm1hdCA9IGZsYWdzLmludGVybmFsZm9ybWF0ID0gQ0hBTk5FTFNfRk9STUFUW2ZsYWdzLmNoYW5uZWxzXTtcclxuICAgICAgfVxyXG4gICAgfSBlbHNlIGlmIChoYXNGb3JtYXQgJiYgaGFzQ2hhbm5lbHMpIHtcclxuICAgICAgY2hlY2skMShcclxuICAgICAgICBmbGFncy5jaGFubmVscyA9PT0gRk9STUFUX0NIQU5ORUxTW2ZsYWdzLmZvcm1hdF0sXHJcbiAgICAgICAgJ251bWJlciBvZiBjaGFubmVscyBpbmNvbnNpc3RlbnQgd2l0aCBzcGVjaWZpZWQgZm9ybWF0Jyk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBzZXRGbGFncyAoZmxhZ3MpIHtcclxuICAgIGdsLnBpeGVsU3RvcmVpKEdMX1VOUEFDS19GTElQX1lfV0VCR0wsIGZsYWdzLmZsaXBZKTtcclxuICAgIGdsLnBpeGVsU3RvcmVpKEdMX1VOUEFDS19QUkVNVUxUSVBMWV9BTFBIQV9XRUJHTCwgZmxhZ3MucHJlbXVsdGlwbHlBbHBoYSk7XHJcbiAgICBnbC5waXhlbFN0b3JlaShHTF9VTlBBQ0tfQ09MT1JTUEFDRV9DT05WRVJTSU9OX1dFQkdMLCBmbGFncy5jb2xvclNwYWNlKTtcclxuICAgIGdsLnBpeGVsU3RvcmVpKEdMX1VOUEFDS19BTElHTk1FTlQsIGZsYWdzLnVucGFja0FsaWdubWVudCk7XHJcbiAgfVxyXG5cclxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgLy8gVGV4IGltYWdlIGRhdGFcclxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgZnVuY3Rpb24gVGV4SW1hZ2UgKCkge1xyXG4gICAgVGV4RmxhZ3MuY2FsbCh0aGlzKTtcclxuXHJcbiAgICB0aGlzLnhPZmZzZXQgPSAwO1xyXG4gICAgdGhpcy55T2Zmc2V0ID0gMDtcclxuXHJcbiAgICAvLyBkYXRhXHJcbiAgICB0aGlzLmRhdGEgPSBudWxsO1xyXG4gICAgdGhpcy5uZWVkc0ZyZWUgPSBmYWxzZTtcclxuXHJcbiAgICAvLyBodG1sIGVsZW1lbnRcclxuICAgIHRoaXMuZWxlbWVudCA9IG51bGw7XHJcblxyXG4gICAgLy8gY29weVRleEltYWdlIGluZm9cclxuICAgIHRoaXMubmVlZHNDb3B5ID0gZmFsc2U7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBwYXJzZUltYWdlIChpbWFnZSwgb3B0aW9ucykge1xyXG4gICAgdmFyIGRhdGEgPSBudWxsO1xyXG4gICAgaWYgKGlzUGl4ZWxEYXRhKG9wdGlvbnMpKSB7XHJcbiAgICAgIGRhdGEgPSBvcHRpb25zO1xyXG4gICAgfSBlbHNlIGlmIChvcHRpb25zKSB7XHJcbiAgICAgIGNoZWNrJDEudHlwZShvcHRpb25zLCAnb2JqZWN0JywgJ2ludmFsaWQgcGl4ZWwgZGF0YSB0eXBlJyk7XHJcbiAgICAgIHBhcnNlRmxhZ3MoaW1hZ2UsIG9wdGlvbnMpO1xyXG4gICAgICBpZiAoJ3gnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICBpbWFnZS54T2Zmc2V0ID0gb3B0aW9ucy54IHwgMDtcclxuICAgICAgfVxyXG4gICAgICBpZiAoJ3knIGluIG9wdGlvbnMpIHtcclxuICAgICAgICBpbWFnZS55T2Zmc2V0ID0gb3B0aW9ucy55IHwgMDtcclxuICAgICAgfVxyXG4gICAgICBpZiAoaXNQaXhlbERhdGEob3B0aW9ucy5kYXRhKSkge1xyXG4gICAgICAgIGRhdGEgPSBvcHRpb25zLmRhdGE7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBjaGVjayQxKFxyXG4gICAgICAhaW1hZ2UuY29tcHJlc3NlZCB8fFxyXG4gICAgICBkYXRhIGluc3RhbmNlb2YgVWludDhBcnJheSxcclxuICAgICAgJ2NvbXByZXNzZWQgdGV4dHVyZSBkYXRhIG11c3QgYmUgc3RvcmVkIGluIGEgdWludDhhcnJheScpO1xyXG5cclxuICAgIGlmIChvcHRpb25zLmNvcHkpIHtcclxuICAgICAgY2hlY2skMSghZGF0YSwgJ2NhbiBub3Qgc3BlY2lmeSBjb3B5IGFuZCBkYXRhIGZpZWxkIGZvciB0aGUgc2FtZSB0ZXh0dXJlJyk7XHJcbiAgICAgIHZhciB2aWV3VyA9IGNvbnRleHRTdGF0ZS52aWV3cG9ydFdpZHRoO1xyXG4gICAgICB2YXIgdmlld0ggPSBjb250ZXh0U3RhdGUudmlld3BvcnRIZWlnaHQ7XHJcbiAgICAgIGltYWdlLndpZHRoID0gaW1hZ2Uud2lkdGggfHwgKHZpZXdXIC0gaW1hZ2UueE9mZnNldCk7XHJcbiAgICAgIGltYWdlLmhlaWdodCA9IGltYWdlLmhlaWdodCB8fCAodmlld0ggLSBpbWFnZS55T2Zmc2V0KTtcclxuICAgICAgaW1hZ2UubmVlZHNDb3B5ID0gdHJ1ZTtcclxuICAgICAgY2hlY2skMShpbWFnZS54T2Zmc2V0ID49IDAgJiYgaW1hZ2UueE9mZnNldCA8IHZpZXdXICYmXHJcbiAgICAgICAgICAgIGltYWdlLnlPZmZzZXQgPj0gMCAmJiBpbWFnZS55T2Zmc2V0IDwgdmlld0ggJiZcclxuICAgICAgICAgICAgaW1hZ2Uud2lkdGggPiAwICYmIGltYWdlLndpZHRoIDw9IHZpZXdXICYmXHJcbiAgICAgICAgICAgIGltYWdlLmhlaWdodCA+IDAgJiYgaW1hZ2UuaGVpZ2h0IDw9IHZpZXdILFxyXG4gICAgICAgICAgICAnY29weSB0ZXh0dXJlIHJlYWQgb3V0IG9mIGJvdW5kcycpO1xyXG4gICAgfSBlbHNlIGlmICghZGF0YSkge1xyXG4gICAgICBpbWFnZS53aWR0aCA9IGltYWdlLndpZHRoIHx8IDE7XHJcbiAgICAgIGltYWdlLmhlaWdodCA9IGltYWdlLmhlaWdodCB8fCAxO1xyXG4gICAgICBpbWFnZS5jaGFubmVscyA9IGltYWdlLmNoYW5uZWxzIHx8IDQ7XHJcbiAgICB9IGVsc2UgaWYgKGlzVHlwZWRBcnJheShkYXRhKSkge1xyXG4gICAgICBpbWFnZS5jaGFubmVscyA9IGltYWdlLmNoYW5uZWxzIHx8IDQ7XHJcbiAgICAgIGltYWdlLmRhdGEgPSBkYXRhO1xyXG4gICAgICBpZiAoISgndHlwZScgaW4gb3B0aW9ucykgJiYgaW1hZ2UudHlwZSA9PT0gR0xfVU5TSUdORURfQllURSQ1KSB7XHJcbiAgICAgICAgaW1hZ2UudHlwZSA9IHR5cGVkQXJyYXlDb2RlJDEoZGF0YSk7XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSBpZiAoaXNOdW1lcmljQXJyYXkoZGF0YSkpIHtcclxuICAgICAgaW1hZ2UuY2hhbm5lbHMgPSBpbWFnZS5jaGFubmVscyB8fCA0O1xyXG4gICAgICBjb252ZXJ0RGF0YShpbWFnZSwgZGF0YSk7XHJcbiAgICAgIGltYWdlLmFsaWdubWVudCA9IDE7XHJcbiAgICAgIGltYWdlLm5lZWRzRnJlZSA9IHRydWU7XHJcbiAgICB9IGVsc2UgaWYgKGlzTkRBcnJheUxpa2UoZGF0YSkpIHtcclxuICAgICAgdmFyIGFycmF5ID0gZGF0YS5kYXRhO1xyXG4gICAgICBpZiAoIUFycmF5LmlzQXJyYXkoYXJyYXkpICYmIGltYWdlLnR5cGUgPT09IEdMX1VOU0lHTkVEX0JZVEUkNSkge1xyXG4gICAgICAgIGltYWdlLnR5cGUgPSB0eXBlZEFycmF5Q29kZSQxKGFycmF5KTtcclxuICAgICAgfVxyXG4gICAgICB2YXIgc2hhcGUgPSBkYXRhLnNoYXBlO1xyXG4gICAgICB2YXIgc3RyaWRlID0gZGF0YS5zdHJpZGU7XHJcbiAgICAgIHZhciBzaGFwZVgsIHNoYXBlWSwgc2hhcGVDLCBzdHJpZGVYLCBzdHJpZGVZLCBzdHJpZGVDO1xyXG4gICAgICBpZiAoc2hhcGUubGVuZ3RoID09PSAzKSB7XHJcbiAgICAgICAgc2hhcGVDID0gc2hhcGVbMl07XHJcbiAgICAgICAgc3RyaWRlQyA9IHN0cmlkZVsyXTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBjaGVjayQxKHNoYXBlLmxlbmd0aCA9PT0gMiwgJ2ludmFsaWQgbmRhcnJheSBwaXhlbCBkYXRhLCBtdXN0IGJlIDIgb3IgM0QnKTtcclxuICAgICAgICBzaGFwZUMgPSAxO1xyXG4gICAgICAgIHN0cmlkZUMgPSAxO1xyXG4gICAgICB9XHJcbiAgICAgIHNoYXBlWCA9IHNoYXBlWzBdO1xyXG4gICAgICBzaGFwZVkgPSBzaGFwZVsxXTtcclxuICAgICAgc3RyaWRlWCA9IHN0cmlkZVswXTtcclxuICAgICAgc3RyaWRlWSA9IHN0cmlkZVsxXTtcclxuICAgICAgaW1hZ2UuYWxpZ25tZW50ID0gMTtcclxuICAgICAgaW1hZ2Uud2lkdGggPSBzaGFwZVg7XHJcbiAgICAgIGltYWdlLmhlaWdodCA9IHNoYXBlWTtcclxuICAgICAgaW1hZ2UuY2hhbm5lbHMgPSBzaGFwZUM7XHJcbiAgICAgIGltYWdlLmZvcm1hdCA9IGltYWdlLmludGVybmFsZm9ybWF0ID0gQ0hBTk5FTFNfRk9STUFUW3NoYXBlQ107XHJcbiAgICAgIGltYWdlLm5lZWRzRnJlZSA9IHRydWU7XHJcbiAgICAgIHRyYW5zcG9zZURhdGEoaW1hZ2UsIGFycmF5LCBzdHJpZGVYLCBzdHJpZGVZLCBzdHJpZGVDLCBkYXRhLm9mZnNldCk7XHJcbiAgICB9IGVsc2UgaWYgKGlzQ2FudmFzRWxlbWVudChkYXRhKSB8fCBpc0NvbnRleHQyRChkYXRhKSkge1xyXG4gICAgICBpZiAoaXNDYW52YXNFbGVtZW50KGRhdGEpKSB7XHJcbiAgICAgICAgaW1hZ2UuZWxlbWVudCA9IGRhdGE7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgaW1hZ2UuZWxlbWVudCA9IGRhdGEuY2FudmFzO1xyXG4gICAgICB9XHJcbiAgICAgIGltYWdlLndpZHRoID0gaW1hZ2UuZWxlbWVudC53aWR0aDtcclxuICAgICAgaW1hZ2UuaGVpZ2h0ID0gaW1hZ2UuZWxlbWVudC5oZWlnaHQ7XHJcbiAgICAgIGltYWdlLmNoYW5uZWxzID0gNDtcclxuICAgIH0gZWxzZSBpZiAoaXNCaXRtYXAoZGF0YSkpIHtcclxuICAgICAgaW1hZ2UuZWxlbWVudCA9IGRhdGE7XHJcbiAgICAgIGltYWdlLndpZHRoID0gZGF0YS53aWR0aDtcclxuICAgICAgaW1hZ2UuaGVpZ2h0ID0gZGF0YS5oZWlnaHQ7XHJcbiAgICAgIGltYWdlLmNoYW5uZWxzID0gNDtcclxuICAgIH0gZWxzZSBpZiAoaXNJbWFnZUVsZW1lbnQoZGF0YSkpIHtcclxuICAgICAgaW1hZ2UuZWxlbWVudCA9IGRhdGE7XHJcbiAgICAgIGltYWdlLndpZHRoID0gZGF0YS5uYXR1cmFsV2lkdGg7XHJcbiAgICAgIGltYWdlLmhlaWdodCA9IGRhdGEubmF0dXJhbEhlaWdodDtcclxuICAgICAgaW1hZ2UuY2hhbm5lbHMgPSA0O1xyXG4gICAgfSBlbHNlIGlmIChpc1ZpZGVvRWxlbWVudChkYXRhKSkge1xyXG4gICAgICBpbWFnZS5lbGVtZW50ID0gZGF0YTtcclxuICAgICAgaW1hZ2Uud2lkdGggPSBkYXRhLnZpZGVvV2lkdGg7XHJcbiAgICAgIGltYWdlLmhlaWdodCA9IGRhdGEudmlkZW9IZWlnaHQ7XHJcbiAgICAgIGltYWdlLmNoYW5uZWxzID0gNDtcclxuICAgIH0gZWxzZSBpZiAoaXNSZWN0QXJyYXkoZGF0YSkpIHtcclxuICAgICAgdmFyIHcgPSBpbWFnZS53aWR0aCB8fCBkYXRhWzBdLmxlbmd0aDtcclxuICAgICAgdmFyIGggPSBpbWFnZS5oZWlnaHQgfHwgZGF0YS5sZW5ndGg7XHJcbiAgICAgIHZhciBjID0gaW1hZ2UuY2hhbm5lbHM7XHJcbiAgICAgIGlmIChpc0FycmF5TGlrZShkYXRhWzBdWzBdKSkge1xyXG4gICAgICAgIGMgPSBjIHx8IGRhdGFbMF1bMF0ubGVuZ3RoO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGMgPSBjIHx8IDE7XHJcbiAgICAgIH1cclxuICAgICAgdmFyIGFycmF5U2hhcGUgPSBmbGF0dGVuVXRpbHMuc2hhcGUoZGF0YSk7XHJcbiAgICAgIHZhciBuID0gMTtcclxuICAgICAgZm9yICh2YXIgZGQgPSAwOyBkZCA8IGFycmF5U2hhcGUubGVuZ3RoOyArK2RkKSB7XHJcbiAgICAgICAgbiAqPSBhcnJheVNoYXBlW2RkXTtcclxuICAgICAgfVxyXG4gICAgICB2YXIgYWxsb2NEYXRhID0gcHJlQ29udmVydChpbWFnZSwgbik7XHJcbiAgICAgIGZsYXR0ZW5VdGlscy5mbGF0dGVuKGRhdGEsIGFycmF5U2hhcGUsICcnLCBhbGxvY0RhdGEpO1xyXG4gICAgICBwb3N0Q29udmVydChpbWFnZSwgYWxsb2NEYXRhKTtcclxuICAgICAgaW1hZ2UuYWxpZ25tZW50ID0gMTtcclxuICAgICAgaW1hZ2Uud2lkdGggPSB3O1xyXG4gICAgICBpbWFnZS5oZWlnaHQgPSBoO1xyXG4gICAgICBpbWFnZS5jaGFubmVscyA9IGM7XHJcbiAgICAgIGltYWdlLmZvcm1hdCA9IGltYWdlLmludGVybmFsZm9ybWF0ID0gQ0hBTk5FTFNfRk9STUFUW2NdO1xyXG4gICAgICBpbWFnZS5uZWVkc0ZyZWUgPSB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChpbWFnZS50eXBlID09PSBHTF9GTE9BVCQ0KSB7XHJcbiAgICAgIGNoZWNrJDEobGltaXRzLmV4dGVuc2lvbnMuaW5kZXhPZignb2VzX3RleHR1cmVfZmxvYXQnKSA+PSAwLFxyXG4gICAgICAgICdvZXNfdGV4dHVyZV9mbG9hdCBleHRlbnNpb24gbm90IGVuYWJsZWQnKTtcclxuICAgIH0gZWxzZSBpZiAoaW1hZ2UudHlwZSA9PT0gR0xfSEFMRl9GTE9BVF9PRVMkMSkge1xyXG4gICAgICBjaGVjayQxKGxpbWl0cy5leHRlbnNpb25zLmluZGV4T2YoJ29lc190ZXh0dXJlX2hhbGZfZmxvYXQnKSA+PSAwLFxyXG4gICAgICAgICdvZXNfdGV4dHVyZV9oYWxmX2Zsb2F0IGV4dGVuc2lvbiBub3QgZW5hYmxlZCcpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIGRvIGNvbXByZXNzZWQgdGV4dHVyZSAgdmFsaWRhdGlvbiBoZXJlLlxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gc2V0SW1hZ2UgKGluZm8sIHRhcmdldCwgbWlwbGV2ZWwpIHtcclxuICAgIHZhciBlbGVtZW50ID0gaW5mby5lbGVtZW50O1xyXG4gICAgdmFyIGRhdGEgPSBpbmZvLmRhdGE7XHJcbiAgICB2YXIgaW50ZXJuYWxmb3JtYXQgPSBpbmZvLmludGVybmFsZm9ybWF0O1xyXG4gICAgdmFyIGZvcm1hdCA9IGluZm8uZm9ybWF0O1xyXG4gICAgdmFyIHR5cGUgPSBpbmZvLnR5cGU7XHJcbiAgICB2YXIgd2lkdGggPSBpbmZvLndpZHRoO1xyXG4gICAgdmFyIGhlaWdodCA9IGluZm8uaGVpZ2h0O1xyXG4gICAgdmFyIGNoYW5uZWxzID0gaW5mby5jaGFubmVscztcclxuXHJcbiAgICBzZXRGbGFncyhpbmZvKTtcclxuXHJcbiAgICBpZiAoZWxlbWVudCkge1xyXG4gICAgICBnbC50ZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGZvcm1hdCwgZm9ybWF0LCB0eXBlLCBlbGVtZW50KTtcclxuICAgIH0gZWxzZSBpZiAoaW5mby5jb21wcmVzc2VkKSB7XHJcbiAgICAgIGdsLmNvbXByZXNzZWRUZXhJbWFnZTJEKHRhcmdldCwgbWlwbGV2ZWwsIGludGVybmFsZm9ybWF0LCB3aWR0aCwgaGVpZ2h0LCAwLCBkYXRhKTtcclxuICAgIH0gZWxzZSBpZiAoaW5mby5uZWVkc0NvcHkpIHtcclxuICAgICAgcmVnbFBvbGwoKTtcclxuICAgICAgZ2wuY29weVRleEltYWdlMkQoXHJcbiAgICAgICAgdGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCBpbmZvLnhPZmZzZXQsIGluZm8ueU9mZnNldCwgd2lkdGgsIGhlaWdodCwgMCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB2YXIgbnVsbERhdGEgPSAhZGF0YTtcclxuICAgICAgaWYgKG51bGxEYXRhKSB7XHJcbiAgICAgICAgZGF0YSA9IHBvb2wuemVyby5hbGxvY1R5cGUodHlwZSwgd2lkdGggKiBoZWlnaHQgKiBjaGFubmVscyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGdsLnRleEltYWdlMkQodGFyZ2V0LCBtaXBsZXZlbCwgZm9ybWF0LCB3aWR0aCwgaGVpZ2h0LCAwLCBmb3JtYXQsIHR5cGUsIGRhdGEpO1xyXG5cclxuICAgICAgaWYgKG51bGxEYXRhICYmIGRhdGEpIHtcclxuICAgICAgICBwb29sLnplcm8uZnJlZVR5cGUoZGF0YSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHNldFN1YkltYWdlIChpbmZvLCB0YXJnZXQsIHgsIHksIG1pcGxldmVsKSB7XHJcbiAgICB2YXIgZWxlbWVudCA9IGluZm8uZWxlbWVudDtcclxuICAgIHZhciBkYXRhID0gaW5mby5kYXRhO1xyXG4gICAgdmFyIGludGVybmFsZm9ybWF0ID0gaW5mby5pbnRlcm5hbGZvcm1hdDtcclxuICAgIHZhciBmb3JtYXQgPSBpbmZvLmZvcm1hdDtcclxuICAgIHZhciB0eXBlID0gaW5mby50eXBlO1xyXG4gICAgdmFyIHdpZHRoID0gaW5mby53aWR0aDtcclxuICAgIHZhciBoZWlnaHQgPSBpbmZvLmhlaWdodDtcclxuXHJcbiAgICBzZXRGbGFncyhpbmZvKTtcclxuXHJcbiAgICBpZiAoZWxlbWVudCkge1xyXG4gICAgICBnbC50ZXhTdWJJbWFnZTJEKFxyXG4gICAgICAgIHRhcmdldCwgbWlwbGV2ZWwsIHgsIHksIGZvcm1hdCwgdHlwZSwgZWxlbWVudCk7XHJcbiAgICB9IGVsc2UgaWYgKGluZm8uY29tcHJlc3NlZCkge1xyXG4gICAgICBnbC5jb21wcmVzc2VkVGV4U3ViSW1hZ2UyRChcclxuICAgICAgICB0YXJnZXQsIG1pcGxldmVsLCB4LCB5LCBpbnRlcm5hbGZvcm1hdCwgd2lkdGgsIGhlaWdodCwgZGF0YSk7XHJcbiAgICB9IGVsc2UgaWYgKGluZm8ubmVlZHNDb3B5KSB7XHJcbiAgICAgIHJlZ2xQb2xsKCk7XHJcbiAgICAgIGdsLmNvcHlUZXhTdWJJbWFnZTJEKFxyXG4gICAgICAgIHRhcmdldCwgbWlwbGV2ZWwsIHgsIHksIGluZm8ueE9mZnNldCwgaW5mby55T2Zmc2V0LCB3aWR0aCwgaGVpZ2h0KTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGdsLnRleFN1YkltYWdlMkQoXHJcbiAgICAgICAgdGFyZ2V0LCBtaXBsZXZlbCwgeCwgeSwgd2lkdGgsIGhlaWdodCwgZm9ybWF0LCB0eXBlLCBkYXRhKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8vIHRleEltYWdlIHBvb2xcclxuICB2YXIgaW1hZ2VQb29sID0gW107XHJcblxyXG4gIGZ1bmN0aW9uIGFsbG9jSW1hZ2UgKCkge1xyXG4gICAgcmV0dXJuIGltYWdlUG9vbC5wb3AoKSB8fCBuZXcgVGV4SW1hZ2UoKVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZnJlZUltYWdlIChpbWFnZSkge1xyXG4gICAgaWYgKGltYWdlLm5lZWRzRnJlZSkge1xyXG4gICAgICBwb29sLmZyZWVUeXBlKGltYWdlLmRhdGEpO1xyXG4gICAgfVxyXG4gICAgVGV4SW1hZ2UuY2FsbChpbWFnZSk7XHJcbiAgICBpbWFnZVBvb2wucHVzaChpbWFnZSk7XHJcbiAgfVxyXG5cclxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgLy8gTWlwIG1hcFxyXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICBmdW5jdGlvbiBNaXBNYXAgKCkge1xyXG4gICAgVGV4RmxhZ3MuY2FsbCh0aGlzKTtcclxuXHJcbiAgICB0aGlzLmdlbk1pcG1hcHMgPSBmYWxzZTtcclxuICAgIHRoaXMubWlwbWFwSGludCA9IEdMX0RPTlRfQ0FSRTtcclxuICAgIHRoaXMubWlwbWFzayA9IDA7XHJcbiAgICB0aGlzLmltYWdlcyA9IEFycmF5KDE2KTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHBhcnNlTWlwTWFwRnJvbVNoYXBlIChtaXBtYXAsIHdpZHRoLCBoZWlnaHQpIHtcclxuICAgIHZhciBpbWcgPSBtaXBtYXAuaW1hZ2VzWzBdID0gYWxsb2NJbWFnZSgpO1xyXG4gICAgbWlwbWFwLm1pcG1hc2sgPSAxO1xyXG4gICAgaW1nLndpZHRoID0gbWlwbWFwLndpZHRoID0gd2lkdGg7XHJcbiAgICBpbWcuaGVpZ2h0ID0gbWlwbWFwLmhlaWdodCA9IGhlaWdodDtcclxuICAgIGltZy5jaGFubmVscyA9IG1pcG1hcC5jaGFubmVscyA9IDQ7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBwYXJzZU1pcE1hcEZyb21PYmplY3QgKG1pcG1hcCwgb3B0aW9ucykge1xyXG4gICAgdmFyIGltZ0RhdGEgPSBudWxsO1xyXG4gICAgaWYgKGlzUGl4ZWxEYXRhKG9wdGlvbnMpKSB7XHJcbiAgICAgIGltZ0RhdGEgPSBtaXBtYXAuaW1hZ2VzWzBdID0gYWxsb2NJbWFnZSgpO1xyXG4gICAgICBjb3B5RmxhZ3MoaW1nRGF0YSwgbWlwbWFwKTtcclxuICAgICAgcGFyc2VJbWFnZShpbWdEYXRhLCBvcHRpb25zKTtcclxuICAgICAgbWlwbWFwLm1pcG1hc2sgPSAxO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgcGFyc2VGbGFncyhtaXBtYXAsIG9wdGlvbnMpO1xyXG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShvcHRpb25zLm1pcG1hcCkpIHtcclxuICAgICAgICB2YXIgbWlwRGF0YSA9IG9wdGlvbnMubWlwbWFwO1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbWlwRGF0YS5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgICAgaW1nRGF0YSA9IG1pcG1hcC5pbWFnZXNbaV0gPSBhbGxvY0ltYWdlKCk7XHJcbiAgICAgICAgICBjb3B5RmxhZ3MoaW1nRGF0YSwgbWlwbWFwKTtcclxuICAgICAgICAgIGltZ0RhdGEud2lkdGggPj49IGk7XHJcbiAgICAgICAgICBpbWdEYXRhLmhlaWdodCA+Pj0gaTtcclxuICAgICAgICAgIHBhcnNlSW1hZ2UoaW1nRGF0YSwgbWlwRGF0YVtpXSk7XHJcbiAgICAgICAgICBtaXBtYXAubWlwbWFzayB8PSAoMSA8PCBpKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgaW1nRGF0YSA9IG1pcG1hcC5pbWFnZXNbMF0gPSBhbGxvY0ltYWdlKCk7XHJcbiAgICAgICAgY29weUZsYWdzKGltZ0RhdGEsIG1pcG1hcCk7XHJcbiAgICAgICAgcGFyc2VJbWFnZShpbWdEYXRhLCBvcHRpb25zKTtcclxuICAgICAgICBtaXBtYXAubWlwbWFzayA9IDE7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIGNvcHlGbGFncyhtaXBtYXAsIG1pcG1hcC5pbWFnZXNbMF0pO1xyXG5cclxuICAgIC8vIEZvciB0ZXh0dXJlcyBvZiB0aGUgY29tcHJlc3NlZCBmb3JtYXQgV0VCR0xfY29tcHJlc3NlZF90ZXh0dXJlX3MzdGNcclxuICAgIC8vIHdlIG11c3QgaGF2ZSB0aGF0XHJcbiAgICAvL1xyXG4gICAgLy8gXCJXaGVuIGxldmVsIGVxdWFscyB6ZXJvIHdpZHRoIGFuZCBoZWlnaHQgbXVzdCBiZSBhIG11bHRpcGxlIG9mIDQuXHJcbiAgICAvLyBXaGVuIGxldmVsIGlzIGdyZWF0ZXIgdGhhbiAwIHdpZHRoIGFuZCBoZWlnaHQgbXVzdCBiZSAwLCAxLCAyIG9yIGEgbXVsdGlwbGUgb2YgNC4gXCJcclxuICAgIC8vXHJcbiAgICAvLyBidXQgd2UgZG8gbm90IHlldCBzdXBwb3J0IGhhdmluZyBtdWx0aXBsZSBtaXBtYXAgbGV2ZWxzIGZvciBjb21wcmVzc2VkIHRleHR1cmVzLFxyXG4gICAgLy8gc28gd2Ugb25seSB0ZXN0IGZvciBsZXZlbCB6ZXJvLlxyXG5cclxuICAgIGlmIChtaXBtYXAuY29tcHJlc3NlZCAmJlxyXG4gICAgICAgIChtaXBtYXAuaW50ZXJuYWxmb3JtYXQgPT09IEdMX0NPTVBSRVNTRURfUkdCX1MzVENfRFhUMV9FWFQpIHx8XHJcbiAgICAgICAgKG1pcG1hcC5pbnRlcm5hbGZvcm1hdCA9PT0gR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUMV9FWFQpIHx8XHJcbiAgICAgICAgKG1pcG1hcC5pbnRlcm5hbGZvcm1hdCA9PT0gR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUM19FWFQpIHx8XHJcbiAgICAgICAgKG1pcG1hcC5pbnRlcm5hbGZvcm1hdCA9PT0gR0xfQ09NUFJFU1NFRF9SR0JBX1MzVENfRFhUNV9FWFQpKSB7XHJcbiAgICAgIGNoZWNrJDEobWlwbWFwLndpZHRoICUgNCA9PT0gMCAmJlxyXG4gICAgICAgICAgICBtaXBtYXAuaGVpZ2h0ICUgNCA9PT0gMCxcclxuICAgICAgICAgICAgJ2ZvciBjb21wcmVzc2VkIHRleHR1cmUgZm9ybWF0cywgbWlwbWFwIGxldmVsIDAgbXVzdCBoYXZlIHdpZHRoIGFuZCBoZWlnaHQgdGhhdCBhcmUgYSBtdWx0aXBsZSBvZiA0Jyk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBzZXRNaXBNYXAgKG1pcG1hcCwgdGFyZ2V0KSB7XHJcbiAgICB2YXIgaW1hZ2VzID0gbWlwbWFwLmltYWdlcztcclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaW1hZ2VzLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgIGlmICghaW1hZ2VzW2ldKSB7XHJcbiAgICAgICAgcmV0dXJuXHJcbiAgICAgIH1cclxuICAgICAgc2V0SW1hZ2UoaW1hZ2VzW2ldLCB0YXJnZXQsIGkpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgdmFyIG1pcFBvb2wgPSBbXTtcclxuXHJcbiAgZnVuY3Rpb24gYWxsb2NNaXBNYXAgKCkge1xyXG4gICAgdmFyIHJlc3VsdCA9IG1pcFBvb2wucG9wKCkgfHwgbmV3IE1pcE1hcCgpO1xyXG4gICAgVGV4RmxhZ3MuY2FsbChyZXN1bHQpO1xyXG4gICAgcmVzdWx0Lm1pcG1hc2sgPSAwO1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCAxNjsgKytpKSB7XHJcbiAgICAgIHJlc3VsdC5pbWFnZXNbaV0gPSBudWxsO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHJlc3VsdFxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZnJlZU1pcE1hcCAobWlwbWFwKSB7XHJcbiAgICB2YXIgaW1hZ2VzID0gbWlwbWFwLmltYWdlcztcclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaW1hZ2VzLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgIGlmIChpbWFnZXNbaV0pIHtcclxuICAgICAgICBmcmVlSW1hZ2UoaW1hZ2VzW2ldKTtcclxuICAgICAgfVxyXG4gICAgICBpbWFnZXNbaV0gPSBudWxsO1xyXG4gICAgfVxyXG4gICAgbWlwUG9vbC5wdXNoKG1pcG1hcCk7XHJcbiAgfVxyXG5cclxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgLy8gVGV4IGluZm9cclxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgZnVuY3Rpb24gVGV4SW5mbyAoKSB7XHJcbiAgICB0aGlzLm1pbkZpbHRlciA9IEdMX05FQVJFU1QkMTtcclxuICAgIHRoaXMubWFnRmlsdGVyID0gR0xfTkVBUkVTVCQxO1xyXG5cclxuICAgIHRoaXMud3JhcFMgPSBHTF9DTEFNUF9UT19FREdFJDE7XHJcbiAgICB0aGlzLndyYXBUID0gR0xfQ0xBTVBfVE9fRURHRSQxO1xyXG5cclxuICAgIHRoaXMuYW5pc290cm9waWMgPSAxO1xyXG5cclxuICAgIHRoaXMuZ2VuTWlwbWFwcyA9IGZhbHNlO1xyXG4gICAgdGhpcy5taXBtYXBIaW50ID0gR0xfRE9OVF9DQVJFO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gcGFyc2VUZXhJbmZvIChpbmZvLCBvcHRpb25zKSB7XHJcbiAgICBpZiAoJ21pbicgaW4gb3B0aW9ucykge1xyXG4gICAgICB2YXIgbWluRmlsdGVyID0gb3B0aW9ucy5taW47XHJcbiAgICAgIGNoZWNrJDEucGFyYW1ldGVyKG1pbkZpbHRlciwgbWluRmlsdGVycyk7XHJcbiAgICAgIGluZm8ubWluRmlsdGVyID0gbWluRmlsdGVyc1ttaW5GaWx0ZXJdO1xyXG4gICAgICBpZiAoTUlQTUFQX0ZJTFRFUlMuaW5kZXhPZihpbmZvLm1pbkZpbHRlcikgPj0gMCAmJiAhKCdmYWNlcycgaW4gb3B0aW9ucykpIHtcclxuICAgICAgICBpbmZvLmdlbk1pcG1hcHMgPSB0cnVlO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCdtYWcnIGluIG9wdGlvbnMpIHtcclxuICAgICAgdmFyIG1hZ0ZpbHRlciA9IG9wdGlvbnMubWFnO1xyXG4gICAgICBjaGVjayQxLnBhcmFtZXRlcihtYWdGaWx0ZXIsIG1hZ0ZpbHRlcnMpO1xyXG4gICAgICBpbmZvLm1hZ0ZpbHRlciA9IG1hZ0ZpbHRlcnNbbWFnRmlsdGVyXTtcclxuICAgIH1cclxuXHJcbiAgICB2YXIgd3JhcFMgPSBpbmZvLndyYXBTO1xyXG4gICAgdmFyIHdyYXBUID0gaW5mby53cmFwVDtcclxuICAgIGlmICgnd3JhcCcgaW4gb3B0aW9ucykge1xyXG4gICAgICB2YXIgd3JhcCA9IG9wdGlvbnMud3JhcDtcclxuICAgICAgaWYgKHR5cGVvZiB3cmFwID09PSAnc3RyaW5nJykge1xyXG4gICAgICAgIGNoZWNrJDEucGFyYW1ldGVyKHdyYXAsIHdyYXBNb2Rlcyk7XHJcbiAgICAgICAgd3JhcFMgPSB3cmFwVCA9IHdyYXBNb2Rlc1t3cmFwXTtcclxuICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHdyYXApKSB7XHJcbiAgICAgICAgY2hlY2skMS5wYXJhbWV0ZXIod3JhcFswXSwgd3JhcE1vZGVzKTtcclxuICAgICAgICBjaGVjayQxLnBhcmFtZXRlcih3cmFwWzFdLCB3cmFwTW9kZXMpO1xyXG4gICAgICAgIHdyYXBTID0gd3JhcE1vZGVzW3dyYXBbMF1dO1xyXG4gICAgICAgIHdyYXBUID0gd3JhcE1vZGVzW3dyYXBbMV1dO1xyXG4gICAgICB9XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBpZiAoJ3dyYXBTJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgdmFyIG9wdFdyYXBTID0gb3B0aW9ucy53cmFwUztcclxuICAgICAgICBjaGVjayQxLnBhcmFtZXRlcihvcHRXcmFwUywgd3JhcE1vZGVzKTtcclxuICAgICAgICB3cmFwUyA9IHdyYXBNb2Rlc1tvcHRXcmFwU107XHJcbiAgICAgIH1cclxuICAgICAgaWYgKCd3cmFwVCcgaW4gb3B0aW9ucykge1xyXG4gICAgICAgIHZhciBvcHRXcmFwVCA9IG9wdGlvbnMud3JhcFQ7XHJcbiAgICAgICAgY2hlY2skMS5wYXJhbWV0ZXIob3B0V3JhcFQsIHdyYXBNb2Rlcyk7XHJcbiAgICAgICAgd3JhcFQgPSB3cmFwTW9kZXNbb3B0V3JhcFRdO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBpbmZvLndyYXBTID0gd3JhcFM7XHJcbiAgICBpbmZvLndyYXBUID0gd3JhcFQ7XHJcblxyXG4gICAgaWYgKCdhbmlzb3Ryb3BpYycgaW4gb3B0aW9ucykge1xyXG4gICAgICB2YXIgYW5pc290cm9waWMgPSBvcHRpb25zLmFuaXNvdHJvcGljO1xyXG4gICAgICBjaGVjayQxKHR5cGVvZiBhbmlzb3Ryb3BpYyA9PT0gJ251bWJlcicgJiZcclxuICAgICAgICAgYW5pc290cm9waWMgPj0gMSAmJiBhbmlzb3Ryb3BpYyA8PSBsaW1pdHMubWF4QW5pc290cm9waWMsXHJcbiAgICAgICAgJ2FuaXNvIHNhbXBsZXMgbXVzdCBiZSBiZXR3ZWVuIDEgYW5kICcpO1xyXG4gICAgICBpbmZvLmFuaXNvdHJvcGljID0gb3B0aW9ucy5hbmlzb3Ryb3BpYztcclxuICAgIH1cclxuXHJcbiAgICBpZiAoJ21pcG1hcCcgaW4gb3B0aW9ucykge1xyXG4gICAgICB2YXIgaGFzTWlwTWFwID0gZmFsc2U7XHJcbiAgICAgIHN3aXRjaCAodHlwZW9mIG9wdGlvbnMubWlwbWFwKSB7XHJcbiAgICAgICAgY2FzZSAnc3RyaW5nJzpcclxuICAgICAgICAgIGNoZWNrJDEucGFyYW1ldGVyKG9wdGlvbnMubWlwbWFwLCBtaXBtYXBIaW50LFxyXG4gICAgICAgICAgICAnaW52YWxpZCBtaXBtYXAgaGludCcpO1xyXG4gICAgICAgICAgaW5mby5taXBtYXBIaW50ID0gbWlwbWFwSGludFtvcHRpb25zLm1pcG1hcF07XHJcbiAgICAgICAgICBpbmZvLmdlbk1pcG1hcHMgPSB0cnVlO1xyXG4gICAgICAgICAgaGFzTWlwTWFwID0gdHJ1ZTtcclxuICAgICAgICAgIGJyZWFrXHJcblxyXG4gICAgICAgIGNhc2UgJ2Jvb2xlYW4nOlxyXG4gICAgICAgICAgaGFzTWlwTWFwID0gaW5mby5nZW5NaXBtYXBzID0gb3B0aW9ucy5taXBtYXA7XHJcbiAgICAgICAgICBicmVha1xyXG5cclxuICAgICAgICBjYXNlICdvYmplY3QnOlxyXG4gICAgICAgICAgY2hlY2skMShBcnJheS5pc0FycmF5KG9wdGlvbnMubWlwbWFwKSwgJ2ludmFsaWQgbWlwbWFwIHR5cGUnKTtcclxuICAgICAgICAgIGluZm8uZ2VuTWlwbWFwcyA9IGZhbHNlO1xyXG4gICAgICAgICAgaGFzTWlwTWFwID0gdHJ1ZTtcclxuICAgICAgICAgIGJyZWFrXHJcblxyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICBjaGVjayQxLnJhaXNlKCdpbnZhbGlkIG1pcG1hcCB0eXBlJyk7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKGhhc01pcE1hcCAmJiAhKCdtaW4nIGluIG9wdGlvbnMpKSB7XHJcbiAgICAgICAgaW5mby5taW5GaWx0ZXIgPSBHTF9ORUFSRVNUX01JUE1BUF9ORUFSRVNUJDE7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHNldFRleEluZm8gKGluZm8sIHRhcmdldCkge1xyXG4gICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfTUlOX0ZJTFRFUiwgaW5mby5taW5GaWx0ZXIpO1xyXG4gICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfTUFHX0ZJTFRFUiwgaW5mby5tYWdGaWx0ZXIpO1xyXG4gICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfV1JBUF9TLCBpbmZvLndyYXBTKTtcclxuICAgIGdsLnRleFBhcmFtZXRlcmkodGFyZ2V0LCBHTF9URVhUVVJFX1dSQVBfVCwgaW5mby53cmFwVCk7XHJcbiAgICBpZiAoZXh0ZW5zaW9ucy5leHRfdGV4dHVyZV9maWx0ZXJfYW5pc290cm9waWMpIHtcclxuICAgICAgZ2wudGV4UGFyYW1ldGVyaSh0YXJnZXQsIEdMX1RFWFRVUkVfTUFYX0FOSVNPVFJPUFlfRVhULCBpbmZvLmFuaXNvdHJvcGljKTtcclxuICAgIH1cclxuICAgIGlmIChpbmZvLmdlbk1pcG1hcHMpIHtcclxuICAgICAgZ2wuaGludChHTF9HRU5FUkFURV9NSVBNQVBfSElOVCwgaW5mby5taXBtYXBIaW50KTtcclxuICAgICAgZ2wuZ2VuZXJhdGVNaXBtYXAodGFyZ2V0KTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICAvLyBGdWxsIHRleHR1cmUgb2JqZWN0XHJcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gIHZhciB0ZXh0dXJlQ291bnQgPSAwO1xyXG4gIHZhciB0ZXh0dXJlU2V0ID0ge307XHJcbiAgdmFyIG51bVRleFVuaXRzID0gbGltaXRzLm1heFRleHR1cmVVbml0cztcclxuICB2YXIgdGV4dHVyZVVuaXRzID0gQXJyYXkobnVtVGV4VW5pdHMpLm1hcChmdW5jdGlvbiAoKSB7XHJcbiAgICByZXR1cm4gbnVsbFxyXG4gIH0pO1xyXG5cclxuICBmdW5jdGlvbiBSRUdMVGV4dHVyZSAodGFyZ2V0KSB7XHJcbiAgICBUZXhGbGFncy5jYWxsKHRoaXMpO1xyXG4gICAgdGhpcy5taXBtYXNrID0gMDtcclxuICAgIHRoaXMuaW50ZXJuYWxmb3JtYXQgPSBHTF9SR0JBJDE7XHJcblxyXG4gICAgdGhpcy5pZCA9IHRleHR1cmVDb3VudCsrO1xyXG5cclxuICAgIHRoaXMucmVmQ291bnQgPSAxO1xyXG5cclxuICAgIHRoaXMudGFyZ2V0ID0gdGFyZ2V0O1xyXG4gICAgdGhpcy50ZXh0dXJlID0gZ2wuY3JlYXRlVGV4dHVyZSgpO1xyXG5cclxuICAgIHRoaXMudW5pdCA9IC0xO1xyXG4gICAgdGhpcy5iaW5kQ291bnQgPSAwO1xyXG5cclxuICAgIHRoaXMudGV4SW5mbyA9IG5ldyBUZXhJbmZvKCk7XHJcblxyXG4gICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XHJcbiAgICAgIHRoaXMuc3RhdHMgPSB7c2l6ZTogMH07XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiB0ZW1wQmluZCAodGV4dHVyZSkge1xyXG4gICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCQxKTtcclxuICAgIGdsLmJpbmRUZXh0dXJlKHRleHR1cmUudGFyZ2V0LCB0ZXh0dXJlLnRleHR1cmUpO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gdGVtcFJlc3RvcmUgKCkge1xyXG4gICAgdmFyIHByZXYgPSB0ZXh0dXJlVW5pdHNbMF07XHJcbiAgICBpZiAocHJldikge1xyXG4gICAgICBnbC5iaW5kVGV4dHVyZShwcmV2LnRhcmdldCwgcHJldi50ZXh0dXJlKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGdsLmJpbmRUZXh0dXJlKEdMX1RFWFRVUkVfMkQkMSwgbnVsbCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBkZXN0cm95ICh0ZXh0dXJlKSB7XHJcbiAgICB2YXIgaGFuZGxlID0gdGV4dHVyZS50ZXh0dXJlO1xyXG4gICAgY2hlY2skMShoYW5kbGUsICdtdXN0IG5vdCBkb3VibGUgZGVzdHJveSB0ZXh0dXJlJyk7XHJcbiAgICB2YXIgdW5pdCA9IHRleHR1cmUudW5pdDtcclxuICAgIHZhciB0YXJnZXQgPSB0ZXh0dXJlLnRhcmdldDtcclxuICAgIGlmICh1bml0ID49IDApIHtcclxuICAgICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCQxICsgdW5pdCk7XHJcbiAgICAgIGdsLmJpbmRUZXh0dXJlKHRhcmdldCwgbnVsbCk7XHJcbiAgICAgIHRleHR1cmVVbml0c1t1bml0XSA9IG51bGw7XHJcbiAgICB9XHJcbiAgICBnbC5kZWxldGVUZXh0dXJlKGhhbmRsZSk7XHJcbiAgICB0ZXh0dXJlLnRleHR1cmUgPSBudWxsO1xyXG4gICAgdGV4dHVyZS5wYXJhbXMgPSBudWxsO1xyXG4gICAgdGV4dHVyZS5waXhlbHMgPSBudWxsO1xyXG4gICAgdGV4dHVyZS5yZWZDb3VudCA9IDA7XHJcbiAgICBkZWxldGUgdGV4dHVyZVNldFt0ZXh0dXJlLmlkXTtcclxuICAgIHN0YXRzLnRleHR1cmVDb3VudC0tO1xyXG4gIH1cclxuXHJcbiAgZXh0ZW5kKFJFR0xUZXh0dXJlLnByb3RvdHlwZSwge1xyXG4gICAgYmluZDogZnVuY3Rpb24gKCkge1xyXG4gICAgICB2YXIgdGV4dHVyZSA9IHRoaXM7XHJcbiAgICAgIHRleHR1cmUuYmluZENvdW50ICs9IDE7XHJcbiAgICAgIHZhciB1bml0ID0gdGV4dHVyZS51bml0O1xyXG4gICAgICBpZiAodW5pdCA8IDApIHtcclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG51bVRleFVuaXRzOyArK2kpIHtcclxuICAgICAgICAgIHZhciBvdGhlciA9IHRleHR1cmVVbml0c1tpXTtcclxuICAgICAgICAgIGlmIChvdGhlcikge1xyXG4gICAgICAgICAgICBpZiAob3RoZXIuYmluZENvdW50ID4gMCkge1xyXG4gICAgICAgICAgICAgIGNvbnRpbnVlXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgb3RoZXIudW5pdCA9IC0xO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgdGV4dHVyZVVuaXRzW2ldID0gdGV4dHVyZTtcclxuICAgICAgICAgIHVuaXQgPSBpO1xyXG4gICAgICAgICAgYnJlYWtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHVuaXQgPj0gbnVtVGV4VW5pdHMpIHtcclxuICAgICAgICAgIGNoZWNrJDEucmFpc2UoJ2luc3VmZmljaWVudCBudW1iZXIgb2YgdGV4dHVyZSB1bml0cycpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoY29uZmlnLnByb2ZpbGUgJiYgc3RhdHMubWF4VGV4dHVyZVVuaXRzIDwgKHVuaXQgKyAxKSkge1xyXG4gICAgICAgICAgc3RhdHMubWF4VGV4dHVyZVVuaXRzID0gdW5pdCArIDE7IC8vICsxLCBzaW5jZSB0aGUgdW5pdHMgYXJlIHplcm8tYmFzZWRcclxuICAgICAgICB9XHJcbiAgICAgICAgdGV4dHVyZS51bml0ID0gdW5pdDtcclxuICAgICAgICBnbC5hY3RpdmVUZXh0dXJlKEdMX1RFWFRVUkUwJDEgKyB1bml0KTtcclxuICAgICAgICBnbC5iaW5kVGV4dHVyZSh0ZXh0dXJlLnRhcmdldCwgdGV4dHVyZS50ZXh0dXJlKTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gdW5pdFxyXG4gICAgfSxcclxuXHJcbiAgICB1bmJpbmQ6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgdGhpcy5iaW5kQ291bnQgLT0gMTtcclxuICAgIH0sXHJcblxyXG4gICAgZGVjUmVmOiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgIGlmICgtLXRoaXMucmVmQ291bnQgPD0gMCkge1xyXG4gICAgICAgIGRlc3Ryb3kodGhpcyk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9KTtcclxuXHJcbiAgZnVuY3Rpb24gY3JlYXRlVGV4dHVyZTJEIChhLCBiKSB7XHJcbiAgICB2YXIgdGV4dHVyZSA9IG5ldyBSRUdMVGV4dHVyZShHTF9URVhUVVJFXzJEJDEpO1xyXG4gICAgdGV4dHVyZVNldFt0ZXh0dXJlLmlkXSA9IHRleHR1cmU7XHJcbiAgICBzdGF0cy50ZXh0dXJlQ291bnQrKztcclxuXHJcbiAgICBmdW5jdGlvbiByZWdsVGV4dHVyZTJEIChhLCBiKSB7XHJcbiAgICAgIHZhciB0ZXhJbmZvID0gdGV4dHVyZS50ZXhJbmZvO1xyXG4gICAgICBUZXhJbmZvLmNhbGwodGV4SW5mbyk7XHJcbiAgICAgIHZhciBtaXBEYXRhID0gYWxsb2NNaXBNYXAoKTtcclxuXHJcbiAgICAgIGlmICh0eXBlb2YgYSA9PT0gJ251bWJlcicpIHtcclxuICAgICAgICBpZiAodHlwZW9mIGIgPT09ICdudW1iZXInKSB7XHJcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21TaGFwZShtaXBEYXRhLCBhIHwgMCwgYiB8IDApO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21TaGFwZShtaXBEYXRhLCBhIHwgMCwgYSB8IDApO1xyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIGlmIChhKSB7XHJcbiAgICAgICAgY2hlY2skMS50eXBlKGEsICdvYmplY3QnLCAnaW52YWxpZCBhcmd1bWVudHMgdG8gcmVnbC50ZXh0dXJlJyk7XHJcbiAgICAgICAgcGFyc2VUZXhJbmZvKHRleEluZm8sIGEpO1xyXG4gICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChtaXBEYXRhLCBhKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBlbXB0eSB0ZXh0dXJlcyBnZXQgYXNzaWduZWQgYSBkZWZhdWx0IHNoYXBlIG9mIDF4MVxyXG4gICAgICAgIHBhcnNlTWlwTWFwRnJvbVNoYXBlKG1pcERhdGEsIDEsIDEpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAodGV4SW5mby5nZW5NaXBtYXBzKSB7XHJcbiAgICAgICAgbWlwRGF0YS5taXBtYXNrID0gKG1pcERhdGEud2lkdGggPDwgMSkgLSAxO1xyXG4gICAgICB9XHJcbiAgICAgIHRleHR1cmUubWlwbWFzayA9IG1pcERhdGEubWlwbWFzaztcclxuXHJcbiAgICAgIGNvcHlGbGFncyh0ZXh0dXJlLCBtaXBEYXRhKTtcclxuXHJcbiAgICAgIGNoZWNrJDEudGV4dHVyZTJEKHRleEluZm8sIG1pcERhdGEsIGxpbWl0cyk7XHJcbiAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQgPSBtaXBEYXRhLmludGVybmFsZm9ybWF0O1xyXG5cclxuICAgICAgcmVnbFRleHR1cmUyRC53aWR0aCA9IG1pcERhdGEud2lkdGg7XHJcbiAgICAgIHJlZ2xUZXh0dXJlMkQuaGVpZ2h0ID0gbWlwRGF0YS5oZWlnaHQ7XHJcblxyXG4gICAgICB0ZW1wQmluZCh0ZXh0dXJlKTtcclxuICAgICAgc2V0TWlwTWFwKG1pcERhdGEsIEdMX1RFWFRVUkVfMkQkMSk7XHJcbiAgICAgIHNldFRleEluZm8odGV4SW5mbywgR0xfVEVYVFVSRV8yRCQxKTtcclxuICAgICAgdGVtcFJlc3RvcmUoKTtcclxuXHJcbiAgICAgIGZyZWVNaXBNYXAobWlwRGF0YSk7XHJcblxyXG4gICAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcclxuICAgICAgICB0ZXh0dXJlLnN0YXRzLnNpemUgPSBnZXRUZXh0dXJlU2l6ZShcclxuICAgICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQsXHJcbiAgICAgICAgICB0ZXh0dXJlLnR5cGUsXHJcbiAgICAgICAgICBtaXBEYXRhLndpZHRoLFxyXG4gICAgICAgICAgbWlwRGF0YS5oZWlnaHQsXHJcbiAgICAgICAgICB0ZXhJbmZvLmdlbk1pcG1hcHMsXHJcbiAgICAgICAgICBmYWxzZSk7XHJcbiAgICAgIH1cclxuICAgICAgcmVnbFRleHR1cmUyRC5mb3JtYXQgPSB0ZXh0dXJlRm9ybWF0c0ludmVydFt0ZXh0dXJlLmludGVybmFsZm9ybWF0XTtcclxuICAgICAgcmVnbFRleHR1cmUyRC50eXBlID0gdGV4dHVyZVR5cGVzSW52ZXJ0W3RleHR1cmUudHlwZV07XHJcblxyXG4gICAgICByZWdsVGV4dHVyZTJELm1hZyA9IG1hZ0ZpbHRlcnNJbnZlcnRbdGV4SW5mby5tYWdGaWx0ZXJdO1xyXG4gICAgICByZWdsVGV4dHVyZTJELm1pbiA9IG1pbkZpbHRlcnNJbnZlcnRbdGV4SW5mby5taW5GaWx0ZXJdO1xyXG5cclxuICAgICAgcmVnbFRleHR1cmUyRC53cmFwUyA9IHdyYXBNb2Rlc0ludmVydFt0ZXhJbmZvLndyYXBTXTtcclxuICAgICAgcmVnbFRleHR1cmUyRC53cmFwVCA9IHdyYXBNb2Rlc0ludmVydFt0ZXhJbmZvLndyYXBUXTtcclxuXHJcbiAgICAgIHJldHVybiByZWdsVGV4dHVyZTJEXHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gc3ViaW1hZ2UgKGltYWdlLCB4XywgeV8sIGxldmVsXykge1xyXG4gICAgICBjaGVjayQxKCEhaW1hZ2UsICdtdXN0IHNwZWNpZnkgaW1hZ2UgZGF0YScpO1xyXG5cclxuICAgICAgdmFyIHggPSB4XyB8IDA7XHJcbiAgICAgIHZhciB5ID0geV8gfCAwO1xyXG4gICAgICB2YXIgbGV2ZWwgPSBsZXZlbF8gfCAwO1xyXG5cclxuICAgICAgdmFyIGltYWdlRGF0YSA9IGFsbG9jSW1hZ2UoKTtcclxuICAgICAgY29weUZsYWdzKGltYWdlRGF0YSwgdGV4dHVyZSk7XHJcbiAgICAgIGltYWdlRGF0YS53aWR0aCA9IDA7XHJcbiAgICAgIGltYWdlRGF0YS5oZWlnaHQgPSAwO1xyXG4gICAgICBwYXJzZUltYWdlKGltYWdlRGF0YSwgaW1hZ2UpO1xyXG4gICAgICBpbWFnZURhdGEud2lkdGggPSBpbWFnZURhdGEud2lkdGggfHwgKCh0ZXh0dXJlLndpZHRoID4+IGxldmVsKSAtIHgpO1xyXG4gICAgICBpbWFnZURhdGEuaGVpZ2h0ID0gaW1hZ2VEYXRhLmhlaWdodCB8fCAoKHRleHR1cmUuaGVpZ2h0ID4+IGxldmVsKSAtIHkpO1xyXG5cclxuICAgICAgY2hlY2skMShcclxuICAgICAgICB0ZXh0dXJlLnR5cGUgPT09IGltYWdlRGF0YS50eXBlICYmXHJcbiAgICAgICAgdGV4dHVyZS5mb3JtYXQgPT09IGltYWdlRGF0YS5mb3JtYXQgJiZcclxuICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0ID09PSBpbWFnZURhdGEuaW50ZXJuYWxmb3JtYXQsXHJcbiAgICAgICAgJ2luY29tcGF0aWJsZSBmb3JtYXQgZm9yIHRleHR1cmUuc3ViaW1hZ2UnKTtcclxuICAgICAgY2hlY2skMShcclxuICAgICAgICB4ID49IDAgJiYgeSA+PSAwICYmXHJcbiAgICAgICAgeCArIGltYWdlRGF0YS53aWR0aCA8PSB0ZXh0dXJlLndpZHRoICYmXHJcbiAgICAgICAgeSArIGltYWdlRGF0YS5oZWlnaHQgPD0gdGV4dHVyZS5oZWlnaHQsXHJcbiAgICAgICAgJ3RleHR1cmUuc3ViaW1hZ2Ugd3JpdGUgb3V0IG9mIGJvdW5kcycpO1xyXG4gICAgICBjaGVjayQxKFxyXG4gICAgICAgIHRleHR1cmUubWlwbWFzayAmICgxIDw8IGxldmVsKSxcclxuICAgICAgICAnbWlzc2luZyBtaXBtYXAgZGF0YScpO1xyXG4gICAgICBjaGVjayQxKFxyXG4gICAgICAgIGltYWdlRGF0YS5kYXRhIHx8IGltYWdlRGF0YS5lbGVtZW50IHx8IGltYWdlRGF0YS5uZWVkc0NvcHksXHJcbiAgICAgICAgJ21pc3NpbmcgaW1hZ2UgZGF0YScpO1xyXG5cclxuICAgICAgdGVtcEJpbmQodGV4dHVyZSk7XHJcbiAgICAgIHNldFN1YkltYWdlKGltYWdlRGF0YSwgR0xfVEVYVFVSRV8yRCQxLCB4LCB5LCBsZXZlbCk7XHJcbiAgICAgIHRlbXBSZXN0b3JlKCk7XHJcblxyXG4gICAgICBmcmVlSW1hZ2UoaW1hZ2VEYXRhKTtcclxuXHJcbiAgICAgIHJldHVybiByZWdsVGV4dHVyZTJEXHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gcmVzaXplICh3XywgaF8pIHtcclxuICAgICAgdmFyIHcgPSB3XyB8IDA7XHJcbiAgICAgIHZhciBoID0gKGhfIHwgMCkgfHwgdztcclxuICAgICAgaWYgKHcgPT09IHRleHR1cmUud2lkdGggJiYgaCA9PT0gdGV4dHVyZS5oZWlnaHQpIHtcclxuICAgICAgICByZXR1cm4gcmVnbFRleHR1cmUyRFxyXG4gICAgICB9XHJcblxyXG4gICAgICByZWdsVGV4dHVyZTJELndpZHRoID0gdGV4dHVyZS53aWR0aCA9IHc7XHJcbiAgICAgIHJlZ2xUZXh0dXJlMkQuaGVpZ2h0ID0gdGV4dHVyZS5oZWlnaHQgPSBoO1xyXG5cclxuICAgICAgdGVtcEJpbmQodGV4dHVyZSk7XHJcblxyXG4gICAgICB2YXIgZGF0YTtcclxuICAgICAgdmFyIGNoYW5uZWxzID0gdGV4dHVyZS5jaGFubmVscztcclxuICAgICAgdmFyIHR5cGUgPSB0ZXh0dXJlLnR5cGU7XHJcblxyXG4gICAgICBmb3IgKHZhciBpID0gMDsgdGV4dHVyZS5taXBtYXNrID4+IGk7ICsraSkge1xyXG4gICAgICAgIHZhciBfdyA9IHcgPj4gaTtcclxuICAgICAgICB2YXIgX2ggPSBoID4+IGk7XHJcbiAgICAgICAgaWYgKCFfdyB8fCAhX2gpIGJyZWFrXHJcbiAgICAgICAgZGF0YSA9IHBvb2wuemVyby5hbGxvY1R5cGUodHlwZSwgX3cgKiBfaCAqIGNoYW5uZWxzKTtcclxuICAgICAgICBnbC50ZXhJbWFnZTJEKFxyXG4gICAgICAgICAgR0xfVEVYVFVSRV8yRCQxLFxyXG4gICAgICAgICAgaSxcclxuICAgICAgICAgIHRleHR1cmUuZm9ybWF0LFxyXG4gICAgICAgICAgX3csXHJcbiAgICAgICAgICBfaCxcclxuICAgICAgICAgIDAsXHJcbiAgICAgICAgICB0ZXh0dXJlLmZvcm1hdCxcclxuICAgICAgICAgIHRleHR1cmUudHlwZSxcclxuICAgICAgICAgIGRhdGEpO1xyXG4gICAgICAgIGlmIChkYXRhKSBwb29sLnplcm8uZnJlZVR5cGUoZGF0YSk7XHJcbiAgICAgIH1cclxuICAgICAgdGVtcFJlc3RvcmUoKTtcclxuXHJcbiAgICAgIC8vIGFsc28sIHJlY29tcHV0ZSB0aGUgdGV4dHVyZSBzaXplLlxyXG4gICAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcclxuICAgICAgICB0ZXh0dXJlLnN0YXRzLnNpemUgPSBnZXRUZXh0dXJlU2l6ZShcclxuICAgICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQsXHJcbiAgICAgICAgICB0ZXh0dXJlLnR5cGUsXHJcbiAgICAgICAgICB3LFxyXG4gICAgICAgICAgaCxcclxuICAgICAgICAgIGZhbHNlLFxyXG4gICAgICAgICAgZmFsc2UpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICByZXR1cm4gcmVnbFRleHR1cmUyRFxyXG4gICAgfVxyXG5cclxuICAgIHJlZ2xUZXh0dXJlMkQoYSwgYik7XHJcblxyXG4gICAgcmVnbFRleHR1cmUyRC5zdWJpbWFnZSA9IHN1YmltYWdlO1xyXG4gICAgcmVnbFRleHR1cmUyRC5yZXNpemUgPSByZXNpemU7XHJcbiAgICByZWdsVGV4dHVyZTJELl9yZWdsVHlwZSA9ICd0ZXh0dXJlMmQnO1xyXG4gICAgcmVnbFRleHR1cmUyRC5fdGV4dHVyZSA9IHRleHR1cmU7XHJcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcclxuICAgICAgcmVnbFRleHR1cmUyRC5zdGF0cyA9IHRleHR1cmUuc3RhdHM7XHJcbiAgICB9XHJcbiAgICByZWdsVGV4dHVyZTJELmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XHJcbiAgICAgIHRleHR1cmUuZGVjUmVmKCk7XHJcbiAgICB9O1xyXG5cclxuICAgIHJldHVybiByZWdsVGV4dHVyZTJEXHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBjcmVhdGVUZXh0dXJlQ3ViZSAoYTAsIGExLCBhMiwgYTMsIGE0LCBhNSkge1xyXG4gICAgdmFyIHRleHR1cmUgPSBuZXcgUkVHTFRleHR1cmUoR0xfVEVYVFVSRV9DVUJFX01BUCQxKTtcclxuICAgIHRleHR1cmVTZXRbdGV4dHVyZS5pZF0gPSB0ZXh0dXJlO1xyXG4gICAgc3RhdHMuY3ViZUNvdW50Kys7XHJcblxyXG4gICAgdmFyIGZhY2VzID0gbmV3IEFycmF5KDYpO1xyXG5cclxuICAgIGZ1bmN0aW9uIHJlZ2xUZXh0dXJlQ3ViZSAoYTAsIGExLCBhMiwgYTMsIGE0LCBhNSkge1xyXG4gICAgICB2YXIgaTtcclxuICAgICAgdmFyIHRleEluZm8gPSB0ZXh0dXJlLnRleEluZm87XHJcbiAgICAgIFRleEluZm8uY2FsbCh0ZXhJbmZvKTtcclxuICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xyXG4gICAgICAgIGZhY2VzW2ldID0gYWxsb2NNaXBNYXAoKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKHR5cGVvZiBhMCA9PT0gJ251bWJlcicgfHwgIWEwKSB7XHJcbiAgICAgICAgdmFyIHMgPSAoYTAgfCAwKSB8fCAxO1xyXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcclxuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbVNoYXBlKGZhY2VzW2ldLCBzLCBzKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGEwID09PSAnb2JqZWN0Jykge1xyXG4gICAgICAgIGlmIChhMSkge1xyXG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KGZhY2VzWzBdLCBhMCk7XHJcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbMV0sIGExKTtcclxuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1syXSwgYTIpO1xyXG4gICAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KGZhY2VzWzNdLCBhMyk7XHJcbiAgICAgICAgICBwYXJzZU1pcE1hcEZyb21PYmplY3QoZmFjZXNbNF0sIGE0KTtcclxuICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1s1XSwgYTUpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBwYXJzZVRleEluZm8odGV4SW5mbywgYTApO1xyXG4gICAgICAgICAgcGFyc2VGbGFncyh0ZXh0dXJlLCBhMCk7XHJcbiAgICAgICAgICBpZiAoJ2ZhY2VzJyBpbiBhMCkge1xyXG4gICAgICAgICAgICB2YXIgZmFjZV9pbnB1dCA9IGEwLmZhY2VzO1xyXG4gICAgICAgICAgICBjaGVjayQxKEFycmF5LmlzQXJyYXkoZmFjZV9pbnB1dCkgJiYgZmFjZV9pbnB1dC5sZW5ndGggPT09IDYsXHJcbiAgICAgICAgICAgICAgJ2N1YmUgZmFjZXMgbXVzdCBiZSBhIGxlbmd0aCA2IGFycmF5Jyk7XHJcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcclxuICAgICAgICAgICAgICBjaGVjayQxKHR5cGVvZiBmYWNlX2lucHV0W2ldID09PSAnb2JqZWN0JyAmJiAhIWZhY2VfaW5wdXRbaV0sXHJcbiAgICAgICAgICAgICAgICAnaW52YWxpZCBpbnB1dCBmb3IgY3ViZSBtYXAgZmFjZScpO1xyXG4gICAgICAgICAgICAgIGNvcHlGbGFncyhmYWNlc1tpXSwgdGV4dHVyZSk7XHJcbiAgICAgICAgICAgICAgcGFyc2VNaXBNYXBGcm9tT2JqZWN0KGZhY2VzW2ldLCBmYWNlX2lucHV0W2ldKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xyXG4gICAgICAgICAgICAgIHBhcnNlTWlwTWFwRnJvbU9iamVjdChmYWNlc1tpXSwgYTApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNoZWNrJDEucmFpc2UoJ2ludmFsaWQgYXJndW1lbnRzIHRvIGN1YmUgbWFwJyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvcHlGbGFncyh0ZXh0dXJlLCBmYWNlc1swXSk7XHJcblxyXG4gICAgICBpZiAoIWxpbWl0cy5ucG90VGV4dHVyZUN1YmUpIHtcclxuICAgICAgICBjaGVjayQxKGlzUG93MiQxKHRleHR1cmUud2lkdGgpICYmIGlzUG93MiQxKHRleHR1cmUuaGVpZ2h0KSwgJ3lvdXIgYnJvd3NlciBkb2VzIG5vdCBzdXBwb3J0IG5vbiBwb3dlciBvciB0d28gdGV4dHVyZSBkaW1lbnNpb25zJyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmICh0ZXhJbmZvLmdlbk1pcG1hcHMpIHtcclxuICAgICAgICB0ZXh0dXJlLm1pcG1hc2sgPSAoZmFjZXNbMF0ud2lkdGggPDwgMSkgLSAxO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRleHR1cmUubWlwbWFzayA9IGZhY2VzWzBdLm1pcG1hc2s7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNoZWNrJDEudGV4dHVyZUN1YmUodGV4dHVyZSwgdGV4SW5mbywgZmFjZXMsIGxpbWl0cyk7XHJcbiAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQgPSBmYWNlc1swXS5pbnRlcm5hbGZvcm1hdDtcclxuXHJcbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS53aWR0aCA9IGZhY2VzWzBdLndpZHRoO1xyXG4gICAgICByZWdsVGV4dHVyZUN1YmUuaGVpZ2h0ID0gZmFjZXNbMF0uaGVpZ2h0O1xyXG5cclxuICAgICAgdGVtcEJpbmQodGV4dHVyZSk7XHJcbiAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcclxuICAgICAgICBzZXRNaXBNYXAoZmFjZXNbaV0sIEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCQxICsgaSk7XHJcbiAgICAgIH1cclxuICAgICAgc2V0VGV4SW5mbyh0ZXhJbmZvLCBHTF9URVhUVVJFX0NVQkVfTUFQJDEpO1xyXG4gICAgICB0ZW1wUmVzdG9yZSgpO1xyXG5cclxuICAgICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XHJcbiAgICAgICAgdGV4dHVyZS5zdGF0cy5zaXplID0gZ2V0VGV4dHVyZVNpemUoXHJcbiAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxyXG4gICAgICAgICAgdGV4dHVyZS50eXBlLFxyXG4gICAgICAgICAgcmVnbFRleHR1cmVDdWJlLndpZHRoLFxyXG4gICAgICAgICAgcmVnbFRleHR1cmVDdWJlLmhlaWdodCxcclxuICAgICAgICAgIHRleEluZm8uZ2VuTWlwbWFwcyxcclxuICAgICAgICAgIHRydWUpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICByZWdsVGV4dHVyZUN1YmUuZm9ybWF0ID0gdGV4dHVyZUZvcm1hdHNJbnZlcnRbdGV4dHVyZS5pbnRlcm5hbGZvcm1hdF07XHJcbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS50eXBlID0gdGV4dHVyZVR5cGVzSW52ZXJ0W3RleHR1cmUudHlwZV07XHJcblxyXG4gICAgICByZWdsVGV4dHVyZUN1YmUubWFnID0gbWFnRmlsdGVyc0ludmVydFt0ZXhJbmZvLm1hZ0ZpbHRlcl07XHJcbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS5taW4gPSBtaW5GaWx0ZXJzSW52ZXJ0W3RleEluZm8ubWluRmlsdGVyXTtcclxuXHJcbiAgICAgIHJlZ2xUZXh0dXJlQ3ViZS53cmFwUyA9IHdyYXBNb2Rlc0ludmVydFt0ZXhJbmZvLndyYXBTXTtcclxuICAgICAgcmVnbFRleHR1cmVDdWJlLndyYXBUID0gd3JhcE1vZGVzSW52ZXJ0W3RleEluZm8ud3JhcFRdO1xyXG5cclxuICAgICAgZm9yIChpID0gMDsgaSA8IDY7ICsraSkge1xyXG4gICAgICAgIGZyZWVNaXBNYXAoZmFjZXNbaV0pO1xyXG4gICAgICB9XHJcblxyXG4gICAgICByZXR1cm4gcmVnbFRleHR1cmVDdWJlXHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gc3ViaW1hZ2UgKGZhY2UsIGltYWdlLCB4XywgeV8sIGxldmVsXykge1xyXG4gICAgICBjaGVjayQxKCEhaW1hZ2UsICdtdXN0IHNwZWNpZnkgaW1hZ2UgZGF0YScpO1xyXG4gICAgICBjaGVjayQxKHR5cGVvZiBmYWNlID09PSAnbnVtYmVyJyAmJiBmYWNlID09PSAoZmFjZSB8IDApICYmXHJcbiAgICAgICAgZmFjZSA+PSAwICYmIGZhY2UgPCA2LCAnaW52YWxpZCBmYWNlJyk7XHJcblxyXG4gICAgICB2YXIgeCA9IHhfIHwgMDtcclxuICAgICAgdmFyIHkgPSB5XyB8IDA7XHJcbiAgICAgIHZhciBsZXZlbCA9IGxldmVsXyB8IDA7XHJcblxyXG4gICAgICB2YXIgaW1hZ2VEYXRhID0gYWxsb2NJbWFnZSgpO1xyXG4gICAgICBjb3B5RmxhZ3MoaW1hZ2VEYXRhLCB0ZXh0dXJlKTtcclxuICAgICAgaW1hZ2VEYXRhLndpZHRoID0gMDtcclxuICAgICAgaW1hZ2VEYXRhLmhlaWdodCA9IDA7XHJcbiAgICAgIHBhcnNlSW1hZ2UoaW1hZ2VEYXRhLCBpbWFnZSk7XHJcbiAgICAgIGltYWdlRGF0YS53aWR0aCA9IGltYWdlRGF0YS53aWR0aCB8fCAoKHRleHR1cmUud2lkdGggPj4gbGV2ZWwpIC0geCk7XHJcbiAgICAgIGltYWdlRGF0YS5oZWlnaHQgPSBpbWFnZURhdGEuaGVpZ2h0IHx8ICgodGV4dHVyZS5oZWlnaHQgPj4gbGV2ZWwpIC0geSk7XHJcblxyXG4gICAgICBjaGVjayQxKFxyXG4gICAgICAgIHRleHR1cmUudHlwZSA9PT0gaW1hZ2VEYXRhLnR5cGUgJiZcclxuICAgICAgICB0ZXh0dXJlLmZvcm1hdCA9PT0gaW1hZ2VEYXRhLmZvcm1hdCAmJlxyXG4gICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQgPT09IGltYWdlRGF0YS5pbnRlcm5hbGZvcm1hdCxcclxuICAgICAgICAnaW5jb21wYXRpYmxlIGZvcm1hdCBmb3IgdGV4dHVyZS5zdWJpbWFnZScpO1xyXG4gICAgICBjaGVjayQxKFxyXG4gICAgICAgIHggPj0gMCAmJiB5ID49IDAgJiZcclxuICAgICAgICB4ICsgaW1hZ2VEYXRhLndpZHRoIDw9IHRleHR1cmUud2lkdGggJiZcclxuICAgICAgICB5ICsgaW1hZ2VEYXRhLmhlaWdodCA8PSB0ZXh0dXJlLmhlaWdodCxcclxuICAgICAgICAndGV4dHVyZS5zdWJpbWFnZSB3cml0ZSBvdXQgb2YgYm91bmRzJyk7XHJcbiAgICAgIGNoZWNrJDEoXHJcbiAgICAgICAgdGV4dHVyZS5taXBtYXNrICYgKDEgPDwgbGV2ZWwpLFxyXG4gICAgICAgICdtaXNzaW5nIG1pcG1hcCBkYXRhJyk7XHJcbiAgICAgIGNoZWNrJDEoXHJcbiAgICAgICAgaW1hZ2VEYXRhLmRhdGEgfHwgaW1hZ2VEYXRhLmVsZW1lbnQgfHwgaW1hZ2VEYXRhLm5lZWRzQ29weSxcclxuICAgICAgICAnbWlzc2luZyBpbWFnZSBkYXRhJyk7XHJcblxyXG4gICAgICB0ZW1wQmluZCh0ZXh0dXJlKTtcclxuICAgICAgc2V0U3ViSW1hZ2UoaW1hZ2VEYXRhLCBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1gkMSArIGZhY2UsIHgsIHksIGxldmVsKTtcclxuICAgICAgdGVtcFJlc3RvcmUoKTtcclxuXHJcbiAgICAgIGZyZWVJbWFnZShpbWFnZURhdGEpO1xyXG5cclxuICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlQ3ViZVxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHJlc2l6ZSAocmFkaXVzXykge1xyXG4gICAgICB2YXIgcmFkaXVzID0gcmFkaXVzXyB8IDA7XHJcbiAgICAgIGlmIChyYWRpdXMgPT09IHRleHR1cmUud2lkdGgpIHtcclxuICAgICAgICByZXR1cm5cclxuICAgICAgfVxyXG5cclxuICAgICAgcmVnbFRleHR1cmVDdWJlLndpZHRoID0gdGV4dHVyZS53aWR0aCA9IHJhZGl1cztcclxuICAgICAgcmVnbFRleHR1cmVDdWJlLmhlaWdodCA9IHRleHR1cmUuaGVpZ2h0ID0gcmFkaXVzO1xyXG5cclxuICAgICAgdGVtcEJpbmQodGV4dHVyZSk7XHJcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgNjsgKytpKSB7XHJcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IHRleHR1cmUubWlwbWFzayA+PiBqOyArK2opIHtcclxuICAgICAgICAgIGdsLnRleEltYWdlMkQoXHJcbiAgICAgICAgICAgIEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCQxICsgaSxcclxuICAgICAgICAgICAgaixcclxuICAgICAgICAgICAgdGV4dHVyZS5mb3JtYXQsXHJcbiAgICAgICAgICAgIHJhZGl1cyA+PiBqLFxyXG4gICAgICAgICAgICByYWRpdXMgPj4gaixcclxuICAgICAgICAgICAgMCxcclxuICAgICAgICAgICAgdGV4dHVyZS5mb3JtYXQsXHJcbiAgICAgICAgICAgIHRleHR1cmUudHlwZSxcclxuICAgICAgICAgICAgbnVsbCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIHRlbXBSZXN0b3JlKCk7XHJcblxyXG4gICAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcclxuICAgICAgICB0ZXh0dXJlLnN0YXRzLnNpemUgPSBnZXRUZXh0dXJlU2l6ZShcclxuICAgICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQsXHJcbiAgICAgICAgICB0ZXh0dXJlLnR5cGUsXHJcbiAgICAgICAgICByZWdsVGV4dHVyZUN1YmUud2lkdGgsXHJcbiAgICAgICAgICByZWdsVGV4dHVyZUN1YmUuaGVpZ2h0LFxyXG4gICAgICAgICAgZmFsc2UsXHJcbiAgICAgICAgICB0cnVlKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuIHJlZ2xUZXh0dXJlQ3ViZVxyXG4gICAgfVxyXG5cclxuICAgIHJlZ2xUZXh0dXJlQ3ViZShhMCwgYTEsIGEyLCBhMywgYTQsIGE1KTtcclxuXHJcbiAgICByZWdsVGV4dHVyZUN1YmUuc3ViaW1hZ2UgPSBzdWJpbWFnZTtcclxuICAgIHJlZ2xUZXh0dXJlQ3ViZS5yZXNpemUgPSByZXNpemU7XHJcbiAgICByZWdsVGV4dHVyZUN1YmUuX3JlZ2xUeXBlID0gJ3RleHR1cmVDdWJlJztcclxuICAgIHJlZ2xUZXh0dXJlQ3ViZS5fdGV4dHVyZSA9IHRleHR1cmU7XHJcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcclxuICAgICAgcmVnbFRleHR1cmVDdWJlLnN0YXRzID0gdGV4dHVyZS5zdGF0cztcclxuICAgIH1cclxuICAgIHJlZ2xUZXh0dXJlQ3ViZS5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xyXG4gICAgICB0ZXh0dXJlLmRlY1JlZigpO1xyXG4gICAgfTtcclxuXHJcbiAgICByZXR1cm4gcmVnbFRleHR1cmVDdWJlXHJcbiAgfVxyXG5cclxuICAvLyBDYWxsZWQgd2hlbiByZWdsIGlzIGRlc3Ryb3llZFxyXG4gIGZ1bmN0aW9uIGRlc3Ryb3lUZXh0dXJlcyAoKSB7XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG51bVRleFVuaXRzOyArK2kpIHtcclxuICAgICAgZ2wuYWN0aXZlVGV4dHVyZShHTF9URVhUVVJFMCQxICsgaSk7XHJcbiAgICAgIGdsLmJpbmRUZXh0dXJlKEdMX1RFWFRVUkVfMkQkMSwgbnVsbCk7XHJcbiAgICAgIHRleHR1cmVVbml0c1tpXSA9IG51bGw7XHJcbiAgICB9XHJcbiAgICB2YWx1ZXModGV4dHVyZVNldCkuZm9yRWFjaChkZXN0cm95KTtcclxuXHJcbiAgICBzdGF0cy5jdWJlQ291bnQgPSAwO1xyXG4gICAgc3RhdHMudGV4dHVyZUNvdW50ID0gMDtcclxuICB9XHJcblxyXG4gIGlmIChjb25maWcucHJvZmlsZSkge1xyXG4gICAgc3RhdHMuZ2V0VG90YWxUZXh0dXJlU2l6ZSA9IGZ1bmN0aW9uICgpIHtcclxuICAgICAgdmFyIHRvdGFsID0gMDtcclxuICAgICAgT2JqZWN0LmtleXModGV4dHVyZVNldCkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XHJcbiAgICAgICAgdG90YWwgKz0gdGV4dHVyZVNldFtrZXldLnN0YXRzLnNpemU7XHJcbiAgICAgIH0pO1xyXG4gICAgICByZXR1cm4gdG90YWxcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiByZXN0b3JlVGV4dHVyZXMgKCkge1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW1UZXhVbml0czsgKytpKSB7XHJcbiAgICAgIHZhciB0ZXggPSB0ZXh0dXJlVW5pdHNbaV07XHJcbiAgICAgIGlmICh0ZXgpIHtcclxuICAgICAgICB0ZXguYmluZENvdW50ID0gMDtcclxuICAgICAgICB0ZXgudW5pdCA9IC0xO1xyXG4gICAgICAgIHRleHR1cmVVbml0c1tpXSA9IG51bGw7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB2YWx1ZXModGV4dHVyZVNldCkuZm9yRWFjaChmdW5jdGlvbiAodGV4dHVyZSkge1xyXG4gICAgICB0ZXh0dXJlLnRleHR1cmUgPSBnbC5jcmVhdGVUZXh0dXJlKCk7XHJcbiAgICAgIGdsLmJpbmRUZXh0dXJlKHRleHR1cmUudGFyZ2V0LCB0ZXh0dXJlLnRleHR1cmUpO1xyXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IDMyOyArK2kpIHtcclxuICAgICAgICBpZiAoKHRleHR1cmUubWlwbWFzayAmICgxIDw8IGkpKSA9PT0gMCkge1xyXG4gICAgICAgICAgY29udGludWVcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRleHR1cmUudGFyZ2V0ID09PSBHTF9URVhUVVJFXzJEJDEpIHtcclxuICAgICAgICAgIGdsLnRleEltYWdlMkQoR0xfVEVYVFVSRV8yRCQxLFxyXG4gICAgICAgICAgICBpLFxyXG4gICAgICAgICAgICB0ZXh0dXJlLmludGVybmFsZm9ybWF0LFxyXG4gICAgICAgICAgICB0ZXh0dXJlLndpZHRoID4+IGksXHJcbiAgICAgICAgICAgIHRleHR1cmUuaGVpZ2h0ID4+IGksXHJcbiAgICAgICAgICAgIDAsXHJcbiAgICAgICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQsXHJcbiAgICAgICAgICAgIHRleHR1cmUudHlwZSxcclxuICAgICAgICAgICAgbnVsbCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgNjsgKytqKSB7XHJcbiAgICAgICAgICAgIGdsLnRleEltYWdlMkQoR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YJDEgKyBqLFxyXG4gICAgICAgICAgICAgIGksXHJcbiAgICAgICAgICAgICAgdGV4dHVyZS5pbnRlcm5hbGZvcm1hdCxcclxuICAgICAgICAgICAgICB0ZXh0dXJlLndpZHRoID4+IGksXHJcbiAgICAgICAgICAgICAgdGV4dHVyZS5oZWlnaHQgPj4gaSxcclxuICAgICAgICAgICAgICAwLFxyXG4gICAgICAgICAgICAgIHRleHR1cmUuaW50ZXJuYWxmb3JtYXQsXHJcbiAgICAgICAgICAgICAgdGV4dHVyZS50eXBlLFxyXG4gICAgICAgICAgICAgIG51bGwpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICBzZXRUZXhJbmZvKHRleHR1cmUudGV4SW5mbywgdGV4dHVyZS50YXJnZXQpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICByZXR1cm4ge1xyXG4gICAgY3JlYXRlMkQ6IGNyZWF0ZVRleHR1cmUyRCxcclxuICAgIGNyZWF0ZUN1YmU6IGNyZWF0ZVRleHR1cmVDdWJlLFxyXG4gICAgY2xlYXI6IGRlc3Ryb3lUZXh0dXJlcyxcclxuICAgIGdldFRleHR1cmU6IGZ1bmN0aW9uICh3cmFwcGVyKSB7XHJcbiAgICAgIHJldHVybiBudWxsXHJcbiAgICB9LFxyXG4gICAgcmVzdG9yZTogcmVzdG9yZVRleHR1cmVzXHJcbiAgfVxyXG59XG5cbnZhciBHTF9SRU5ERVJCVUZGRVIgPSAweDhENDE7XHJcblxyXG52YXIgR0xfUkdCQTQkMSA9IDB4ODA1NjtcclxudmFyIEdMX1JHQjVfQTEkMSA9IDB4ODA1NztcclxudmFyIEdMX1JHQjU2NSQxID0gMHg4RDYyO1xyXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UMTYgPSAweDgxQTU7XHJcbnZhciBHTF9TVEVOQ0lMX0lOREVYOCA9IDB4OEQ0ODtcclxudmFyIEdMX0RFUFRIX1NURU5DSUwkMSA9IDB4ODRGOTtcclxuXHJcbnZhciBHTF9TUkdCOF9BTFBIQThfRVhUID0gMHg4QzQzO1xyXG5cclxudmFyIEdMX1JHQkEzMkZfRVhUID0gMHg4ODE0O1xyXG5cclxudmFyIEdMX1JHQkExNkZfRVhUID0gMHg4ODFBO1xyXG52YXIgR0xfUkdCMTZGX0VYVCA9IDB4ODgxQjtcclxuXHJcbnZhciBGT1JNQVRfU0laRVMgPSBbXTtcclxuXHJcbkZPUk1BVF9TSVpFU1tHTF9SR0JBNCQxXSA9IDI7XHJcbkZPUk1BVF9TSVpFU1tHTF9SR0I1X0ExJDFdID0gMjtcclxuRk9STUFUX1NJWkVTW0dMX1JHQjU2NSQxXSA9IDI7XHJcblxyXG5GT1JNQVRfU0laRVNbR0xfREVQVEhfQ09NUE9ORU5UMTZdID0gMjtcclxuRk9STUFUX1NJWkVTW0dMX1NURU5DSUxfSU5ERVg4XSA9IDE7XHJcbkZPUk1BVF9TSVpFU1tHTF9ERVBUSF9TVEVOQ0lMJDFdID0gNDtcclxuXHJcbkZPUk1BVF9TSVpFU1tHTF9TUkdCOF9BTFBIQThfRVhUXSA9IDQ7XHJcbkZPUk1BVF9TSVpFU1tHTF9SR0JBMzJGX0VYVF0gPSAxNjtcclxuRk9STUFUX1NJWkVTW0dMX1JHQkExNkZfRVhUXSA9IDg7XHJcbkZPUk1BVF9TSVpFU1tHTF9SR0IxNkZfRVhUXSA9IDY7XHJcblxyXG5mdW5jdGlvbiBnZXRSZW5kZXJidWZmZXJTaXplIChmb3JtYXQsIHdpZHRoLCBoZWlnaHQpIHtcclxuICByZXR1cm4gRk9STUFUX1NJWkVTW2Zvcm1hdF0gKiB3aWR0aCAqIGhlaWdodFxyXG59XHJcblxyXG52YXIgd3JhcFJlbmRlcmJ1ZmZlcnMgPSBmdW5jdGlvbiAoZ2wsIGV4dGVuc2lvbnMsIGxpbWl0cywgc3RhdHMsIGNvbmZpZykge1xyXG4gIHZhciBmb3JtYXRUeXBlcyA9IHtcclxuICAgICdyZ2JhNCc6IEdMX1JHQkE0JDEsXHJcbiAgICAncmdiNTY1JzogR0xfUkdCNTY1JDEsXHJcbiAgICAncmdiNSBhMSc6IEdMX1JHQjVfQTEkMSxcclxuICAgICdkZXB0aCc6IEdMX0RFUFRIX0NPTVBPTkVOVDE2LFxyXG4gICAgJ3N0ZW5jaWwnOiBHTF9TVEVOQ0lMX0lOREVYOCxcclxuICAgICdkZXB0aCBzdGVuY2lsJzogR0xfREVQVEhfU1RFTkNJTCQxXHJcbiAgfTtcclxuXHJcbiAgaWYgKGV4dGVuc2lvbnMuZXh0X3NyZ2IpIHtcclxuICAgIGZvcm1hdFR5cGVzWydzcmdiYSddID0gR0xfU1JHQjhfQUxQSEE4X0VYVDtcclxuICB9XHJcblxyXG4gIGlmIChleHRlbnNpb25zLmV4dF9jb2xvcl9idWZmZXJfaGFsZl9mbG9hdCkge1xyXG4gICAgZm9ybWF0VHlwZXNbJ3JnYmExNmYnXSA9IEdMX1JHQkExNkZfRVhUO1xyXG4gICAgZm9ybWF0VHlwZXNbJ3JnYjE2ZiddID0gR0xfUkdCMTZGX0VYVDtcclxuICB9XHJcblxyXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbG9yX2J1ZmZlcl9mbG9hdCkge1xyXG4gICAgZm9ybWF0VHlwZXNbJ3JnYmEzMmYnXSA9IEdMX1JHQkEzMkZfRVhUO1xyXG4gIH1cclxuXHJcbiAgdmFyIGZvcm1hdFR5cGVzSW52ZXJ0ID0gW107XHJcbiAgT2JqZWN0LmtleXMoZm9ybWF0VHlwZXMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xyXG4gICAgdmFyIHZhbCA9IGZvcm1hdFR5cGVzW2tleV07XHJcbiAgICBmb3JtYXRUeXBlc0ludmVydFt2YWxdID0ga2V5O1xyXG4gIH0pO1xyXG5cclxuICB2YXIgcmVuZGVyYnVmZmVyQ291bnQgPSAwO1xyXG4gIHZhciByZW5kZXJidWZmZXJTZXQgPSB7fTtcclxuXHJcbiAgZnVuY3Rpb24gUkVHTFJlbmRlcmJ1ZmZlciAocmVuZGVyYnVmZmVyKSB7XHJcbiAgICB0aGlzLmlkID0gcmVuZGVyYnVmZmVyQ291bnQrKztcclxuICAgIHRoaXMucmVmQ291bnQgPSAxO1xyXG5cclxuICAgIHRoaXMucmVuZGVyYnVmZmVyID0gcmVuZGVyYnVmZmVyO1xyXG5cclxuICAgIHRoaXMuZm9ybWF0ID0gR0xfUkdCQTQkMTtcclxuICAgIHRoaXMud2lkdGggPSAwO1xyXG4gICAgdGhpcy5oZWlnaHQgPSAwO1xyXG5cclxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xyXG4gICAgICB0aGlzLnN0YXRzID0ge3NpemU6IDB9O1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgUkVHTFJlbmRlcmJ1ZmZlci5wcm90b3R5cGUuZGVjUmVmID0gZnVuY3Rpb24gKCkge1xyXG4gICAgaWYgKC0tdGhpcy5yZWZDb3VudCA8PSAwKSB7XHJcbiAgICAgIGRlc3Ryb3kodGhpcyk7XHJcbiAgICB9XHJcbiAgfTtcclxuXHJcbiAgZnVuY3Rpb24gZGVzdHJveSAocmIpIHtcclxuICAgIHZhciBoYW5kbGUgPSByYi5yZW5kZXJidWZmZXI7XHJcbiAgICBjaGVjayQxKGhhbmRsZSwgJ211c3Qgbm90IGRvdWJsZSBkZXN0cm95IHJlbmRlcmJ1ZmZlcicpO1xyXG4gICAgZ2wuYmluZFJlbmRlcmJ1ZmZlcihHTF9SRU5ERVJCVUZGRVIsIG51bGwpO1xyXG4gICAgZ2wuZGVsZXRlUmVuZGVyYnVmZmVyKGhhbmRsZSk7XHJcbiAgICByYi5yZW5kZXJidWZmZXIgPSBudWxsO1xyXG4gICAgcmIucmVmQ291bnQgPSAwO1xyXG4gICAgZGVsZXRlIHJlbmRlcmJ1ZmZlclNldFtyYi5pZF07XHJcbiAgICBzdGF0cy5yZW5kZXJidWZmZXJDb3VudC0tO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gY3JlYXRlUmVuZGVyYnVmZmVyIChhLCBiKSB7XHJcbiAgICB2YXIgcmVuZGVyYnVmZmVyID0gbmV3IFJFR0xSZW5kZXJidWZmZXIoZ2wuY3JlYXRlUmVuZGVyYnVmZmVyKCkpO1xyXG4gICAgcmVuZGVyYnVmZmVyU2V0W3JlbmRlcmJ1ZmZlci5pZF0gPSByZW5kZXJidWZmZXI7XHJcbiAgICBzdGF0cy5yZW5kZXJidWZmZXJDb3VudCsrO1xyXG5cclxuICAgIGZ1bmN0aW9uIHJlZ2xSZW5kZXJidWZmZXIgKGEsIGIpIHtcclxuICAgICAgdmFyIHcgPSAwO1xyXG4gICAgICB2YXIgaCA9IDA7XHJcbiAgICAgIHZhciBmb3JtYXQgPSBHTF9SR0JBNCQxO1xyXG5cclxuICAgICAgaWYgKHR5cGVvZiBhID09PSAnb2JqZWN0JyAmJiBhKSB7XHJcbiAgICAgICAgdmFyIG9wdGlvbnMgPSBhO1xyXG4gICAgICAgIGlmICgnc2hhcGUnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgIHZhciBzaGFwZSA9IG9wdGlvbnMuc2hhcGU7XHJcbiAgICAgICAgICBjaGVjayQxKEFycmF5LmlzQXJyYXkoc2hhcGUpICYmIHNoYXBlLmxlbmd0aCA+PSAyLFxyXG4gICAgICAgICAgICAnaW52YWxpZCByZW5kZXJidWZmZXIgc2hhcGUnKTtcclxuICAgICAgICAgIHcgPSBzaGFwZVswXSB8IDA7XHJcbiAgICAgICAgICBoID0gc2hhcGVbMV0gfCAwO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBpZiAoJ3JhZGl1cycgaW4gb3B0aW9ucykge1xyXG4gICAgICAgICAgICB3ID0gaCA9IG9wdGlvbnMucmFkaXVzIHwgMDtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGlmICgnd2lkdGgnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgICAgdyA9IG9wdGlvbnMud2lkdGggfCAwO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgICAgaCA9IG9wdGlvbnMuaGVpZ2h0IHwgMDtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKCdmb3JtYXQnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgIGNoZWNrJDEucGFyYW1ldGVyKG9wdGlvbnMuZm9ybWF0LCBmb3JtYXRUeXBlcyxcclxuICAgICAgICAgICAgJ2ludmFsaWQgcmVuZGVyYnVmZmVyIGZvcm1hdCcpO1xyXG4gICAgICAgICAgZm9ybWF0ID0gZm9ybWF0VHlwZXNbb3B0aW9ucy5mb3JtYXRdO1xyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgYSA9PT0gJ251bWJlcicpIHtcclxuICAgICAgICB3ID0gYSB8IDA7XHJcbiAgICAgICAgaWYgKHR5cGVvZiBiID09PSAnbnVtYmVyJykge1xyXG4gICAgICAgICAgaCA9IGIgfCAwO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBoID0gdztcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSBpZiAoIWEpIHtcclxuICAgICAgICB3ID0gaCA9IDE7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgY2hlY2skMS5yYWlzZSgnaW52YWxpZCBhcmd1bWVudHMgdG8gcmVuZGVyYnVmZmVyIGNvbnN0cnVjdG9yJyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIGNoZWNrIHNoYXBlXHJcbiAgICAgIGNoZWNrJDEoXHJcbiAgICAgICAgdyA+IDAgJiYgaCA+IDAgJiZcclxuICAgICAgICB3IDw9IGxpbWl0cy5tYXhSZW5kZXJidWZmZXJTaXplICYmIGggPD0gbGltaXRzLm1heFJlbmRlcmJ1ZmZlclNpemUsXHJcbiAgICAgICAgJ2ludmFsaWQgcmVuZGVyYnVmZmVyIHNpemUnKTtcclxuXHJcbiAgICAgIGlmICh3ID09PSByZW5kZXJidWZmZXIud2lkdGggJiZcclxuICAgICAgICAgIGggPT09IHJlbmRlcmJ1ZmZlci5oZWlnaHQgJiZcclxuICAgICAgICAgIGZvcm1hdCA9PT0gcmVuZGVyYnVmZmVyLmZvcm1hdCkge1xyXG4gICAgICAgIHJldHVyblxyXG4gICAgICB9XHJcblxyXG4gICAgICByZWdsUmVuZGVyYnVmZmVyLndpZHRoID0gcmVuZGVyYnVmZmVyLndpZHRoID0gdztcclxuICAgICAgcmVnbFJlbmRlcmJ1ZmZlci5oZWlnaHQgPSByZW5kZXJidWZmZXIuaGVpZ2h0ID0gaDtcclxuICAgICAgcmVuZGVyYnVmZmVyLmZvcm1hdCA9IGZvcm1hdDtcclxuXHJcbiAgICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoR0xfUkVOREVSQlVGRkVSLCByZW5kZXJidWZmZXIucmVuZGVyYnVmZmVyKTtcclxuICAgICAgZ2wucmVuZGVyYnVmZmVyU3RvcmFnZShHTF9SRU5ERVJCVUZGRVIsIGZvcm1hdCwgdywgaCk7XHJcblxyXG4gICAgICBjaGVjayQxKFxyXG4gICAgICAgIGdsLmdldEVycm9yKCkgPT09IDAsXHJcbiAgICAgICAgJ2ludmFsaWQgcmVuZGVyIGJ1ZmZlciBmb3JtYXQnKTtcclxuXHJcbiAgICAgIGlmIChjb25maWcucHJvZmlsZSkge1xyXG4gICAgICAgIHJlbmRlcmJ1ZmZlci5zdGF0cy5zaXplID0gZ2V0UmVuZGVyYnVmZmVyU2l6ZShyZW5kZXJidWZmZXIuZm9ybWF0LCByZW5kZXJidWZmZXIud2lkdGgsIHJlbmRlcmJ1ZmZlci5oZWlnaHQpO1xyXG4gICAgICB9XHJcbiAgICAgIHJlZ2xSZW5kZXJidWZmZXIuZm9ybWF0ID0gZm9ybWF0VHlwZXNJbnZlcnRbcmVuZGVyYnVmZmVyLmZvcm1hdF07XHJcblxyXG4gICAgICByZXR1cm4gcmVnbFJlbmRlcmJ1ZmZlclxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHJlc2l6ZSAod18sIGhfKSB7XHJcbiAgICAgIHZhciB3ID0gd18gfCAwO1xyXG4gICAgICB2YXIgaCA9IChoXyB8IDApIHx8IHc7XHJcblxyXG4gICAgICBpZiAodyA9PT0gcmVuZGVyYnVmZmVyLndpZHRoICYmIGggPT09IHJlbmRlcmJ1ZmZlci5oZWlnaHQpIHtcclxuICAgICAgICByZXR1cm4gcmVnbFJlbmRlcmJ1ZmZlclxyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBjaGVjayBzaGFwZVxyXG4gICAgICBjaGVjayQxKFxyXG4gICAgICAgIHcgPiAwICYmIGggPiAwICYmXHJcbiAgICAgICAgdyA8PSBsaW1pdHMubWF4UmVuZGVyYnVmZmVyU2l6ZSAmJiBoIDw9IGxpbWl0cy5tYXhSZW5kZXJidWZmZXJTaXplLFxyXG4gICAgICAgICdpbnZhbGlkIHJlbmRlcmJ1ZmZlciBzaXplJyk7XHJcblxyXG4gICAgICByZWdsUmVuZGVyYnVmZmVyLndpZHRoID0gcmVuZGVyYnVmZmVyLndpZHRoID0gdztcclxuICAgICAgcmVnbFJlbmRlcmJ1ZmZlci5oZWlnaHQgPSByZW5kZXJidWZmZXIuaGVpZ2h0ID0gaDtcclxuXHJcbiAgICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoR0xfUkVOREVSQlVGRkVSLCByZW5kZXJidWZmZXIucmVuZGVyYnVmZmVyKTtcclxuICAgICAgZ2wucmVuZGVyYnVmZmVyU3RvcmFnZShHTF9SRU5ERVJCVUZGRVIsIHJlbmRlcmJ1ZmZlci5mb3JtYXQsIHcsIGgpO1xyXG5cclxuICAgICAgY2hlY2skMShcclxuICAgICAgICBnbC5nZXRFcnJvcigpID09PSAwLFxyXG4gICAgICAgICdpbnZhbGlkIHJlbmRlciBidWZmZXIgZm9ybWF0Jyk7XHJcblxyXG4gICAgICAvLyBhbHNvLCByZWNvbXB1dGUgc2l6ZS5cclxuICAgICAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XHJcbiAgICAgICAgcmVuZGVyYnVmZmVyLnN0YXRzLnNpemUgPSBnZXRSZW5kZXJidWZmZXJTaXplKFxyXG4gICAgICAgICAgcmVuZGVyYnVmZmVyLmZvcm1hdCwgcmVuZGVyYnVmZmVyLndpZHRoLCByZW5kZXJidWZmZXIuaGVpZ2h0KTtcclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuIHJlZ2xSZW5kZXJidWZmZXJcclxuICAgIH1cclxuXHJcbiAgICByZWdsUmVuZGVyYnVmZmVyKGEsIGIpO1xyXG5cclxuICAgIHJlZ2xSZW5kZXJidWZmZXIucmVzaXplID0gcmVzaXplO1xyXG4gICAgcmVnbFJlbmRlcmJ1ZmZlci5fcmVnbFR5cGUgPSAncmVuZGVyYnVmZmVyJztcclxuICAgIHJlZ2xSZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlciA9IHJlbmRlcmJ1ZmZlcjtcclxuICAgIGlmIChjb25maWcucHJvZmlsZSkge1xyXG4gICAgICByZWdsUmVuZGVyYnVmZmVyLnN0YXRzID0gcmVuZGVyYnVmZmVyLnN0YXRzO1xyXG4gICAgfVxyXG4gICAgcmVnbFJlbmRlcmJ1ZmZlci5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xyXG4gICAgICByZW5kZXJidWZmZXIuZGVjUmVmKCk7XHJcbiAgICB9O1xyXG5cclxuICAgIHJldHVybiByZWdsUmVuZGVyYnVmZmVyXHJcbiAgfVxyXG5cclxuICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcclxuICAgIHN0YXRzLmdldFRvdGFsUmVuZGVyYnVmZmVyU2l6ZSA9IGZ1bmN0aW9uICgpIHtcclxuICAgICAgdmFyIHRvdGFsID0gMDtcclxuICAgICAgT2JqZWN0LmtleXMocmVuZGVyYnVmZmVyU2V0KS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcclxuICAgICAgICB0b3RhbCArPSByZW5kZXJidWZmZXJTZXRba2V5XS5zdGF0cy5zaXplO1xyXG4gICAgICB9KTtcclxuICAgICAgcmV0dXJuIHRvdGFsXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gcmVzdG9yZVJlbmRlcmJ1ZmZlcnMgKCkge1xyXG4gICAgdmFsdWVzKHJlbmRlcmJ1ZmZlclNldCkuZm9yRWFjaChmdW5jdGlvbiAocmIpIHtcclxuICAgICAgcmIucmVuZGVyYnVmZmVyID0gZ2wuY3JlYXRlUmVuZGVyYnVmZmVyKCk7XHJcbiAgICAgIGdsLmJpbmRSZW5kZXJidWZmZXIoR0xfUkVOREVSQlVGRkVSLCByYi5yZW5kZXJidWZmZXIpO1xyXG4gICAgICBnbC5yZW5kZXJidWZmZXJTdG9yYWdlKEdMX1JFTkRFUkJVRkZFUiwgcmIuZm9ybWF0LCByYi53aWR0aCwgcmIuaGVpZ2h0KTtcclxuICAgIH0pO1xyXG4gICAgZ2wuYmluZFJlbmRlcmJ1ZmZlcihHTF9SRU5ERVJCVUZGRVIsIG51bGwpO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIGNyZWF0ZTogY3JlYXRlUmVuZGVyYnVmZmVyLFxyXG4gICAgY2xlYXI6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgdmFsdWVzKHJlbmRlcmJ1ZmZlclNldCkuZm9yRWFjaChkZXN0cm95KTtcclxuICAgIH0sXHJcbiAgICByZXN0b3JlOiByZXN0b3JlUmVuZGVyYnVmZmVyc1xyXG4gIH1cclxufTtcblxuLy8gV2Ugc3RvcmUgdGhlc2UgY29uc3RhbnRzIHNvIHRoYXQgdGhlIG1pbmlmaWVyIGNhbiBpbmxpbmUgdGhlbVxyXG52YXIgR0xfRlJBTUVCVUZGRVIkMSA9IDB4OEQ0MDtcclxudmFyIEdMX1JFTkRFUkJVRkZFUiQxID0gMHg4RDQxO1xyXG5cclxudmFyIEdMX1RFWFRVUkVfMkQkMiA9IDB4MERFMTtcclxudmFyIEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCQyID0gMHg4NTE1O1xyXG5cclxudmFyIEdMX0NPTE9SX0FUVEFDSE1FTlQwJDEgPSAweDhDRTA7XHJcbnZhciBHTF9ERVBUSF9BVFRBQ0hNRU5UID0gMHg4RDAwO1xyXG52YXIgR0xfU1RFTkNJTF9BVFRBQ0hNRU5UID0gMHg4RDIwO1xyXG52YXIgR0xfREVQVEhfU1RFTkNJTF9BVFRBQ0hNRU5UID0gMHg4MjFBO1xyXG5cclxudmFyIEdMX0ZSQU1FQlVGRkVSX0NPTVBMRVRFJDEgPSAweDhDRDU7XHJcbnZhciBHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0FUVEFDSE1FTlQgPSAweDhDRDY7XHJcbnZhciBHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX01JU1NJTkdfQVRUQUNITUVOVCA9IDB4OENENztcclxudmFyIEdMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfRElNRU5TSU9OUyA9IDB4OENEOTtcclxudmFyIEdMX0ZSQU1FQlVGRkVSX1VOU1VQUE9SVEVEID0gMHg4Q0REO1xyXG5cclxudmFyIEdMX0hBTEZfRkxPQVRfT0VTJDIgPSAweDhENjE7XHJcbnZhciBHTF9VTlNJR05FRF9CWVRFJDYgPSAweDE0MDE7XHJcbnZhciBHTF9GTE9BVCQ1ID0gMHgxNDA2O1xyXG5cclxudmFyIEdMX1JHQiQxID0gMHgxOTA3O1xyXG52YXIgR0xfUkdCQSQyID0gMHgxOTA4O1xyXG5cclxudmFyIEdMX0RFUFRIX0NPTVBPTkVOVCQxID0gMHgxOTAyO1xyXG5cclxudmFyIGNvbG9yVGV4dHVyZUZvcm1hdEVudW1zID0gW1xyXG4gIEdMX1JHQiQxLFxyXG4gIEdMX1JHQkEkMlxyXG5dO1xyXG5cclxuLy8gZm9yIGV2ZXJ5IHRleHR1cmUgZm9ybWF0LCBzdG9yZVxyXG4vLyB0aGUgbnVtYmVyIG9mIGNoYW5uZWxzXHJcbnZhciB0ZXh0dXJlRm9ybWF0Q2hhbm5lbHMgPSBbXTtcclxudGV4dHVyZUZvcm1hdENoYW5uZWxzW0dMX1JHQkEkMl0gPSA0O1xyXG50ZXh0dXJlRm9ybWF0Q2hhbm5lbHNbR0xfUkdCJDFdID0gMztcclxuXHJcbi8vIGZvciBldmVyeSB0ZXh0dXJlIHR5cGUsIHN0b3JlXHJcbi8vIHRoZSBzaXplIGluIGJ5dGVzLlxyXG52YXIgdGV4dHVyZVR5cGVTaXplcyA9IFtdO1xyXG50ZXh0dXJlVHlwZVNpemVzW0dMX1VOU0lHTkVEX0JZVEUkNl0gPSAxO1xyXG50ZXh0dXJlVHlwZVNpemVzW0dMX0ZMT0FUJDVdID0gNDtcclxudGV4dHVyZVR5cGVTaXplc1tHTF9IQUxGX0ZMT0FUX09FUyQyXSA9IDI7XHJcblxyXG52YXIgR0xfUkdCQTQkMiA9IDB4ODA1NjtcclxudmFyIEdMX1JHQjVfQTEkMiA9IDB4ODA1NztcclxudmFyIEdMX1JHQjU2NSQyID0gMHg4RDYyO1xyXG52YXIgR0xfREVQVEhfQ09NUE9ORU5UMTYkMSA9IDB4ODFBNTtcclxudmFyIEdMX1NURU5DSUxfSU5ERVg4JDEgPSAweDhENDg7XHJcbnZhciBHTF9ERVBUSF9TVEVOQ0lMJDIgPSAweDg0Rjk7XHJcblxyXG52YXIgR0xfU1JHQjhfQUxQSEE4X0VYVCQxID0gMHg4QzQzO1xyXG5cclxudmFyIEdMX1JHQkEzMkZfRVhUJDEgPSAweDg4MTQ7XHJcblxyXG52YXIgR0xfUkdCQTE2Rl9FWFQkMSA9IDB4ODgxQTtcclxudmFyIEdMX1JHQjE2Rl9FWFQkMSA9IDB4ODgxQjtcclxuXHJcbnZhciBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdEVudW1zID0gW1xyXG4gIEdMX1JHQkE0JDIsXHJcbiAgR0xfUkdCNV9BMSQyLFxyXG4gIEdMX1JHQjU2NSQyLFxyXG4gIEdMX1NSR0I4X0FMUEhBOF9FWFQkMSxcclxuICBHTF9SR0JBMTZGX0VYVCQxLFxyXG4gIEdMX1JHQjE2Rl9FWFQkMSxcclxuICBHTF9SR0JBMzJGX0VYVCQxXHJcbl07XHJcblxyXG52YXIgc3RhdHVzQ29kZSA9IHt9O1xyXG5zdGF0dXNDb2RlW0dMX0ZSQU1FQlVGRkVSX0NPTVBMRVRFJDFdID0gJ2NvbXBsZXRlJztcclxuc3RhdHVzQ29kZVtHTF9GUkFNRUJVRkZFUl9JTkNPTVBMRVRFX0FUVEFDSE1FTlRdID0gJ2luY29tcGxldGUgYXR0YWNobWVudCc7XHJcbnN0YXR1c0NvZGVbR0xfRlJBTUVCVUZGRVJfSU5DT01QTEVURV9ESU1FTlNJT05TXSA9ICdpbmNvbXBsZXRlIGRpbWVuc2lvbnMnO1xyXG5zdGF0dXNDb2RlW0dMX0ZSQU1FQlVGRkVSX0lOQ09NUExFVEVfTUlTU0lOR19BVFRBQ0hNRU5UXSA9ICdpbmNvbXBsZXRlLCBtaXNzaW5nIGF0dGFjaG1lbnQnO1xyXG5zdGF0dXNDb2RlW0dMX0ZSQU1FQlVGRkVSX1VOU1VQUE9SVEVEXSA9ICd1bnN1cHBvcnRlZCc7XHJcblxyXG5mdW5jdGlvbiB3cmFwRkJPU3RhdGUgKFxyXG4gIGdsLFxyXG4gIGV4dGVuc2lvbnMsXHJcbiAgbGltaXRzLFxyXG4gIHRleHR1cmVTdGF0ZSxcclxuICByZW5kZXJidWZmZXJTdGF0ZSxcclxuICBzdGF0cykge1xyXG4gIHZhciBmcmFtZWJ1ZmZlclN0YXRlID0ge1xyXG4gICAgY3VyOiBudWxsLFxyXG4gICAgbmV4dDogbnVsbCxcclxuICAgIGRpcnR5OiBmYWxzZSxcclxuICAgIHNldEZCTzogbnVsbFxyXG4gIH07XHJcblxyXG4gIHZhciBjb2xvclRleHR1cmVGb3JtYXRzID0gWydyZ2JhJ107XHJcbiAgdmFyIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cyA9IFsncmdiYTQnLCAncmdiNTY1JywgJ3JnYjUgYTEnXTtcclxuXHJcbiAgaWYgKGV4dGVuc2lvbnMuZXh0X3NyZ2IpIHtcclxuICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cy5wdXNoKCdzcmdiYScpO1xyXG4gIH1cclxuXHJcbiAgaWYgKGV4dGVuc2lvbnMuZXh0X2NvbG9yX2J1ZmZlcl9oYWxmX2Zsb2F0KSB7XHJcbiAgICBjb2xvclJlbmRlcmJ1ZmZlckZvcm1hdHMucHVzaCgncmdiYTE2ZicsICdyZ2IxNmYnKTtcclxuICB9XHJcblxyXG4gIGlmIChleHRlbnNpb25zLndlYmdsX2NvbG9yX2J1ZmZlcl9mbG9hdCkge1xyXG4gICAgY29sb3JSZW5kZXJidWZmZXJGb3JtYXRzLnB1c2goJ3JnYmEzMmYnKTtcclxuICB9XHJcblxyXG4gIHZhciBjb2xvclR5cGVzID0gWyd1aW50OCddO1xyXG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2hhbGZfZmxvYXQpIHtcclxuICAgIGNvbG9yVHlwZXMucHVzaCgnaGFsZiBmbG9hdCcsICdmbG9hdDE2Jyk7XHJcbiAgfVxyXG4gIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2Zsb2F0KSB7XHJcbiAgICBjb2xvclR5cGVzLnB1c2goJ2Zsb2F0JywgJ2Zsb2F0MzInKTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIEZyYW1lYnVmZmVyQXR0YWNobWVudCAodGFyZ2V0LCB0ZXh0dXJlLCByZW5kZXJidWZmZXIpIHtcclxuICAgIHRoaXMudGFyZ2V0ID0gdGFyZ2V0O1xyXG4gICAgdGhpcy50ZXh0dXJlID0gdGV4dHVyZTtcclxuICAgIHRoaXMucmVuZGVyYnVmZmVyID0gcmVuZGVyYnVmZmVyO1xyXG5cclxuICAgIHZhciB3ID0gMDtcclxuICAgIHZhciBoID0gMDtcclxuICAgIGlmICh0ZXh0dXJlKSB7XHJcbiAgICAgIHcgPSB0ZXh0dXJlLndpZHRoO1xyXG4gICAgICBoID0gdGV4dHVyZS5oZWlnaHQ7XHJcbiAgICB9IGVsc2UgaWYgKHJlbmRlcmJ1ZmZlcikge1xyXG4gICAgICB3ID0gcmVuZGVyYnVmZmVyLndpZHRoO1xyXG4gICAgICBoID0gcmVuZGVyYnVmZmVyLmhlaWdodDtcclxuICAgIH1cclxuICAgIHRoaXMud2lkdGggPSB3O1xyXG4gICAgdGhpcy5oZWlnaHQgPSBoO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZGVjUmVmIChhdHRhY2htZW50KSB7XHJcbiAgICBpZiAoYXR0YWNobWVudCkge1xyXG4gICAgICBpZiAoYXR0YWNobWVudC50ZXh0dXJlKSB7XHJcbiAgICAgICAgYXR0YWNobWVudC50ZXh0dXJlLl90ZXh0dXJlLmRlY1JlZigpO1xyXG4gICAgICB9XHJcbiAgICAgIGlmIChhdHRhY2htZW50LnJlbmRlcmJ1ZmZlcikge1xyXG4gICAgICAgIGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIuZGVjUmVmKCk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGluY1JlZkFuZENoZWNrU2hhcGUgKGF0dGFjaG1lbnQsIHdpZHRoLCBoZWlnaHQpIHtcclxuICAgIGlmICghYXR0YWNobWVudCkge1xyXG4gICAgICByZXR1cm5cclxuICAgIH1cclxuICAgIGlmIChhdHRhY2htZW50LnRleHR1cmUpIHtcclxuICAgICAgdmFyIHRleHR1cmUgPSBhdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmU7XHJcbiAgICAgIHZhciB0dyA9IE1hdGgubWF4KDEsIHRleHR1cmUud2lkdGgpO1xyXG4gICAgICB2YXIgdGggPSBNYXRoLm1heCgxLCB0ZXh0dXJlLmhlaWdodCk7XHJcbiAgICAgIGNoZWNrJDEodHcgPT09IHdpZHRoICYmIHRoID09PSBoZWlnaHQsXHJcbiAgICAgICAgJ2luY29uc2lzdGVudCB3aWR0aC9oZWlnaHQgZm9yIHN1cHBsaWVkIHRleHR1cmUnKTtcclxuICAgICAgdGV4dHVyZS5yZWZDb3VudCArPSAxO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdmFyIHJlbmRlcmJ1ZmZlciA9IGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXI7XHJcbiAgICAgIGNoZWNrJDEoXHJcbiAgICAgICAgcmVuZGVyYnVmZmVyLndpZHRoID09PSB3aWR0aCAmJiByZW5kZXJidWZmZXIuaGVpZ2h0ID09PSBoZWlnaHQsXHJcbiAgICAgICAgJ2luY29uc2lzdGVudCB3aWR0aC9oZWlnaHQgZm9yIHJlbmRlcmJ1ZmZlcicpO1xyXG4gICAgICByZW5kZXJidWZmZXIucmVmQ291bnQgKz0gMTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGF0dGFjaCAobG9jYXRpb24sIGF0dGFjaG1lbnQpIHtcclxuICAgIGlmIChhdHRhY2htZW50KSB7XHJcbiAgICAgIGlmIChhdHRhY2htZW50LnRleHR1cmUpIHtcclxuICAgICAgICBnbC5mcmFtZWJ1ZmZlclRleHR1cmUyRChcclxuICAgICAgICAgIEdMX0ZSQU1FQlVGRkVSJDEsXHJcbiAgICAgICAgICBsb2NhdGlvbixcclxuICAgICAgICAgIGF0dGFjaG1lbnQudGFyZ2V0LFxyXG4gICAgICAgICAgYXR0YWNobWVudC50ZXh0dXJlLl90ZXh0dXJlLnRleHR1cmUsXHJcbiAgICAgICAgICAwKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBnbC5mcmFtZWJ1ZmZlclJlbmRlcmJ1ZmZlcihcclxuICAgICAgICAgIEdMX0ZSQU1FQlVGRkVSJDEsXHJcbiAgICAgICAgICBsb2NhdGlvbixcclxuICAgICAgICAgIEdMX1JFTkRFUkJVRkZFUiQxLFxyXG4gICAgICAgICAgYXR0YWNobWVudC5yZW5kZXJidWZmZXIuX3JlbmRlcmJ1ZmZlci5yZW5kZXJidWZmZXIpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBwYXJzZUF0dGFjaG1lbnQgKGF0dGFjaG1lbnQpIHtcclxuICAgIHZhciB0YXJnZXQgPSBHTF9URVhUVVJFXzJEJDI7XHJcbiAgICB2YXIgdGV4dHVyZSA9IG51bGw7XHJcbiAgICB2YXIgcmVuZGVyYnVmZmVyID0gbnVsbDtcclxuXHJcbiAgICB2YXIgZGF0YSA9IGF0dGFjaG1lbnQ7XHJcbiAgICBpZiAodHlwZW9mIGF0dGFjaG1lbnQgPT09ICdvYmplY3QnKSB7XHJcbiAgICAgIGRhdGEgPSBhdHRhY2htZW50LmRhdGE7XHJcbiAgICAgIGlmICgndGFyZ2V0JyBpbiBhdHRhY2htZW50KSB7XHJcbiAgICAgICAgdGFyZ2V0ID0gYXR0YWNobWVudC50YXJnZXQgfCAwO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgY2hlY2skMS50eXBlKGRhdGEsICdmdW5jdGlvbicsICdpbnZhbGlkIGF0dGFjaG1lbnQgZGF0YScpO1xyXG5cclxuICAgIHZhciB0eXBlID0gZGF0YS5fcmVnbFR5cGU7XHJcbiAgICBpZiAodHlwZSA9PT0gJ3RleHR1cmUyZCcpIHtcclxuICAgICAgdGV4dHVyZSA9IGRhdGE7XHJcbiAgICAgIGNoZWNrJDEodGFyZ2V0ID09PSBHTF9URVhUVVJFXzJEJDIpO1xyXG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAndGV4dHVyZUN1YmUnKSB7XHJcbiAgICAgIHRleHR1cmUgPSBkYXRhO1xyXG4gICAgICBjaGVjayQxKFxyXG4gICAgICAgIHRhcmdldCA+PSBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1gkMiAmJlxyXG4gICAgICAgIHRhcmdldCA8IEdMX1RFWFRVUkVfQ1VCRV9NQVBfUE9TSVRJVkVfWCQyICsgNixcclxuICAgICAgICAnaW52YWxpZCBjdWJlIG1hcCB0YXJnZXQnKTtcclxuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3JlbmRlcmJ1ZmZlcicpIHtcclxuICAgICAgcmVuZGVyYnVmZmVyID0gZGF0YTtcclxuICAgICAgdGFyZ2V0ID0gR0xfUkVOREVSQlVGRkVSJDE7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBjaGVjayQxLnJhaXNlKCdpbnZhbGlkIHJlZ2wgb2JqZWN0IGZvciBhdHRhY2htZW50Jyk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIG5ldyBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQodGFyZ2V0LCB0ZXh0dXJlLCByZW5kZXJidWZmZXIpXHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBhbGxvY0F0dGFjaG1lbnQgKFxyXG4gICAgd2lkdGgsXHJcbiAgICBoZWlnaHQsXHJcbiAgICBpc1RleHR1cmUsXHJcbiAgICBmb3JtYXQsXHJcbiAgICB0eXBlKSB7XHJcbiAgICBpZiAoaXNUZXh0dXJlKSB7XHJcbiAgICAgIHZhciB0ZXh0dXJlID0gdGV4dHVyZVN0YXRlLmNyZWF0ZTJEKHtcclxuICAgICAgICB3aWR0aDogd2lkdGgsXHJcbiAgICAgICAgaGVpZ2h0OiBoZWlnaHQsXHJcbiAgICAgICAgZm9ybWF0OiBmb3JtYXQsXHJcbiAgICAgICAgdHlwZTogdHlwZVxyXG4gICAgICB9KTtcclxuICAgICAgdGV4dHVyZS5fdGV4dHVyZS5yZWZDb3VudCA9IDA7XHJcbiAgICAgIHJldHVybiBuZXcgRnJhbWVidWZmZXJBdHRhY2htZW50KEdMX1RFWFRVUkVfMkQkMiwgdGV4dHVyZSwgbnVsbClcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHZhciByYiA9IHJlbmRlcmJ1ZmZlclN0YXRlLmNyZWF0ZSh7XHJcbiAgICAgICAgd2lkdGg6IHdpZHRoLFxyXG4gICAgICAgIGhlaWdodDogaGVpZ2h0LFxyXG4gICAgICAgIGZvcm1hdDogZm9ybWF0XHJcbiAgICAgIH0pO1xyXG4gICAgICByYi5fcmVuZGVyYnVmZmVyLnJlZkNvdW50ID0gMDtcclxuICAgICAgcmV0dXJuIG5ldyBGcmFtZWJ1ZmZlckF0dGFjaG1lbnQoR0xfUkVOREVSQlVGRkVSJDEsIG51bGwsIHJiKVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gdW53cmFwQXR0YWNobWVudCAoYXR0YWNobWVudCkge1xyXG4gICAgcmV0dXJuIGF0dGFjaG1lbnQgJiYgKGF0dGFjaG1lbnQudGV4dHVyZSB8fCBhdHRhY2htZW50LnJlbmRlcmJ1ZmZlcilcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHJlc2l6ZUF0dGFjaG1lbnQgKGF0dGFjaG1lbnQsIHcsIGgpIHtcclxuICAgIGlmIChhdHRhY2htZW50KSB7XHJcbiAgICAgIGlmIChhdHRhY2htZW50LnRleHR1cmUpIHtcclxuICAgICAgICBhdHRhY2htZW50LnRleHR1cmUucmVzaXplKHcsIGgpO1xyXG4gICAgICB9IGVsc2UgaWYgKGF0dGFjaG1lbnQucmVuZGVyYnVmZmVyKSB7XHJcbiAgICAgICAgYXR0YWNobWVudC5yZW5kZXJidWZmZXIucmVzaXplKHcsIGgpO1xyXG4gICAgICB9XHJcbiAgICAgIGF0dGFjaG1lbnQud2lkdGggPSB3O1xyXG4gICAgICBhdHRhY2htZW50LmhlaWdodCA9IGg7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICB2YXIgZnJhbWVidWZmZXJDb3VudCA9IDA7XHJcbiAgdmFyIGZyYW1lYnVmZmVyU2V0ID0ge307XHJcblxyXG4gIGZ1bmN0aW9uIFJFR0xGcmFtZWJ1ZmZlciAoKSB7XHJcbiAgICB0aGlzLmlkID0gZnJhbWVidWZmZXJDb3VudCsrO1xyXG4gICAgZnJhbWVidWZmZXJTZXRbdGhpcy5pZF0gPSB0aGlzO1xyXG5cclxuICAgIHRoaXMuZnJhbWVidWZmZXIgPSBnbC5jcmVhdGVGcmFtZWJ1ZmZlcigpO1xyXG4gICAgdGhpcy53aWR0aCA9IDA7XHJcbiAgICB0aGlzLmhlaWdodCA9IDA7XHJcblxyXG4gICAgdGhpcy5jb2xvckF0dGFjaG1lbnRzID0gW107XHJcbiAgICB0aGlzLmRlcHRoQXR0YWNobWVudCA9IG51bGw7XHJcbiAgICB0aGlzLnN0ZW5jaWxBdHRhY2htZW50ID0gbnVsbDtcclxuICAgIHRoaXMuZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IG51bGw7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBkZWNGQk9SZWZzIChmcmFtZWJ1ZmZlcikge1xyXG4gICAgZnJhbWVidWZmZXIuY29sb3JBdHRhY2htZW50cy5mb3JFYWNoKGRlY1JlZik7XHJcbiAgICBkZWNSZWYoZnJhbWVidWZmZXIuZGVwdGhBdHRhY2htZW50KTtcclxuICAgIGRlY1JlZihmcmFtZWJ1ZmZlci5zdGVuY2lsQXR0YWNobWVudCk7XHJcbiAgICBkZWNSZWYoZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudCk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBkZXN0cm95IChmcmFtZWJ1ZmZlcikge1xyXG4gICAgdmFyIGhhbmRsZSA9IGZyYW1lYnVmZmVyLmZyYW1lYnVmZmVyO1xyXG4gICAgY2hlY2skMShoYW5kbGUsICdtdXN0IG5vdCBkb3VibGUgZGVzdHJveSBmcmFtZWJ1ZmZlcicpO1xyXG4gICAgZ2wuZGVsZXRlRnJhbWVidWZmZXIoaGFuZGxlKTtcclxuICAgIGZyYW1lYnVmZmVyLmZyYW1lYnVmZmVyID0gbnVsbDtcclxuICAgIHN0YXRzLmZyYW1lYnVmZmVyQ291bnQtLTtcclxuICAgIGRlbGV0ZSBmcmFtZWJ1ZmZlclNldFtmcmFtZWJ1ZmZlci5pZF07XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiB1cGRhdGVGcmFtZWJ1ZmZlciAoZnJhbWVidWZmZXIpIHtcclxuICAgIHZhciBpO1xyXG5cclxuICAgIGdsLmJpbmRGcmFtZWJ1ZmZlcihHTF9GUkFNRUJVRkZFUiQxLCBmcmFtZWJ1ZmZlci5mcmFtZWJ1ZmZlcik7XHJcbiAgICB2YXIgY29sb3JBdHRhY2htZW50cyA9IGZyYW1lYnVmZmVyLmNvbG9yQXR0YWNobWVudHM7XHJcbiAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JBdHRhY2htZW50cy5sZW5ndGg7ICsraSkge1xyXG4gICAgICBhdHRhY2goR0xfQ09MT1JfQVRUQUNITUVOVDAkMSArIGksIGNvbG9yQXR0YWNobWVudHNbaV0pO1xyXG4gICAgfVxyXG4gICAgZm9yIChpID0gY29sb3JBdHRhY2htZW50cy5sZW5ndGg7IGkgPCBsaW1pdHMubWF4Q29sb3JBdHRhY2htZW50czsgKytpKSB7XHJcbiAgICAgIGdsLmZyYW1lYnVmZmVyVGV4dHVyZTJEKFxyXG4gICAgICAgIEdMX0ZSQU1FQlVGRkVSJDEsXHJcbiAgICAgICAgR0xfQ09MT1JfQVRUQUNITUVOVDAkMSArIGksXHJcbiAgICAgICAgR0xfVEVYVFVSRV8yRCQyLFxyXG4gICAgICAgIG51bGwsXHJcbiAgICAgICAgMCk7XHJcbiAgICB9XHJcblxyXG4gICAgZ2wuZnJhbWVidWZmZXJUZXh0dXJlMkQoXHJcbiAgICAgIEdMX0ZSQU1FQlVGRkVSJDEsXHJcbiAgICAgIEdMX0RFUFRIX1NURU5DSUxfQVRUQUNITUVOVCxcclxuICAgICAgR0xfVEVYVFVSRV8yRCQyLFxyXG4gICAgICBudWxsLFxyXG4gICAgICAwKTtcclxuICAgIGdsLmZyYW1lYnVmZmVyVGV4dHVyZTJEKFxyXG4gICAgICBHTF9GUkFNRUJVRkZFUiQxLFxyXG4gICAgICBHTF9ERVBUSF9BVFRBQ0hNRU5ULFxyXG4gICAgICBHTF9URVhUVVJFXzJEJDIsXHJcbiAgICAgIG51bGwsXHJcbiAgICAgIDApO1xyXG4gICAgZ2wuZnJhbWVidWZmZXJUZXh0dXJlMkQoXHJcbiAgICAgIEdMX0ZSQU1FQlVGRkVSJDEsXHJcbiAgICAgIEdMX1NURU5DSUxfQVRUQUNITUVOVCxcclxuICAgICAgR0xfVEVYVFVSRV8yRCQyLFxyXG4gICAgICBudWxsLFxyXG4gICAgICAwKTtcclxuXHJcbiAgICBhdHRhY2goR0xfREVQVEhfQVRUQUNITUVOVCwgZnJhbWVidWZmZXIuZGVwdGhBdHRhY2htZW50KTtcclxuICAgIGF0dGFjaChHTF9TVEVOQ0lMX0FUVEFDSE1FTlQsIGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50KTtcclxuICAgIGF0dGFjaChHTF9ERVBUSF9TVEVOQ0lMX0FUVEFDSE1FTlQsIGZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQpO1xyXG5cclxuICAgIC8vIENoZWNrIHN0YXR1cyBjb2RlXHJcbiAgICB2YXIgc3RhdHVzID0gZ2wuY2hlY2tGcmFtZWJ1ZmZlclN0YXR1cyhHTF9GUkFNRUJVRkZFUiQxKTtcclxuICAgIGlmICghZ2wuaXNDb250ZXh0TG9zdCgpICYmIHN0YXR1cyAhPT0gR0xfRlJBTUVCVUZGRVJfQ09NUExFVEUkMSkge1xyXG4gICAgICBjaGVjayQxLnJhaXNlKCdmcmFtZWJ1ZmZlciBjb25maWd1cmF0aW9uIG5vdCBzdXBwb3J0ZWQsIHN0YXR1cyA9ICcgK1xyXG4gICAgICAgIHN0YXR1c0NvZGVbc3RhdHVzXSk7XHJcbiAgICB9XHJcblxyXG4gICAgZ2wuYmluZEZyYW1lYnVmZmVyKEdMX0ZSQU1FQlVGRkVSJDEsIGZyYW1lYnVmZmVyU3RhdGUubmV4dCA/IGZyYW1lYnVmZmVyU3RhdGUubmV4dC5mcmFtZWJ1ZmZlciA6IG51bGwpO1xyXG4gICAgZnJhbWVidWZmZXJTdGF0ZS5jdXIgPSBmcmFtZWJ1ZmZlclN0YXRlLm5leHQ7XHJcblxyXG4gICAgLy8gRklYTUU6IENsZWFyIGVycm9yIGNvZGUgaGVyZS4gIFRoaXMgaXMgYSB3b3JrIGFyb3VuZCBmb3IgYSBidWcgaW5cclxuICAgIC8vIGhlYWRsZXNzLWdsXHJcbiAgICBnbC5nZXRFcnJvcigpO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gY3JlYXRlRkJPIChhMCwgYTEpIHtcclxuICAgIHZhciBmcmFtZWJ1ZmZlciA9IG5ldyBSRUdMRnJhbWVidWZmZXIoKTtcclxuICAgIHN0YXRzLmZyYW1lYnVmZmVyQ291bnQrKztcclxuXHJcbiAgICBmdW5jdGlvbiByZWdsRnJhbWVidWZmZXIgKGEsIGIpIHtcclxuICAgICAgdmFyIGk7XHJcblxyXG4gICAgICBjaGVjayQxKGZyYW1lYnVmZmVyU3RhdGUubmV4dCAhPT0gZnJhbWVidWZmZXIsXHJcbiAgICAgICAgJ2NhbiBub3QgdXBkYXRlIGZyYW1lYnVmZmVyIHdoaWNoIGlzIGN1cnJlbnRseSBpbiB1c2UnKTtcclxuXHJcbiAgICAgIHZhciB3aWR0aCA9IDA7XHJcbiAgICAgIHZhciBoZWlnaHQgPSAwO1xyXG5cclxuICAgICAgdmFyIG5lZWRzRGVwdGggPSB0cnVlO1xyXG4gICAgICB2YXIgbmVlZHNTdGVuY2lsID0gdHJ1ZTtcclxuXHJcbiAgICAgIHZhciBjb2xvckJ1ZmZlciA9IG51bGw7XHJcbiAgICAgIHZhciBjb2xvclRleHR1cmUgPSB0cnVlO1xyXG4gICAgICB2YXIgY29sb3JGb3JtYXQgPSAncmdiYSc7XHJcbiAgICAgIHZhciBjb2xvclR5cGUgPSAndWludDgnO1xyXG4gICAgICB2YXIgY29sb3JDb3VudCA9IDE7XHJcblxyXG4gICAgICB2YXIgZGVwdGhCdWZmZXIgPSBudWxsO1xyXG4gICAgICB2YXIgc3RlbmNpbEJ1ZmZlciA9IG51bGw7XHJcbiAgICAgIHZhciBkZXB0aFN0ZW5jaWxCdWZmZXIgPSBudWxsO1xyXG4gICAgICB2YXIgZGVwdGhTdGVuY2lsVGV4dHVyZSA9IGZhbHNlO1xyXG5cclxuICAgICAgaWYgKHR5cGVvZiBhID09PSAnbnVtYmVyJykge1xyXG4gICAgICAgIHdpZHRoID0gYSB8IDA7XHJcbiAgICAgICAgaGVpZ2h0ID0gKGIgfCAwKSB8fCB3aWR0aDtcclxuICAgICAgfSBlbHNlIGlmICghYSkge1xyXG4gICAgICAgIHdpZHRoID0gaGVpZ2h0ID0gMTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBjaGVjayQxLnR5cGUoYSwgJ29iamVjdCcsICdpbnZhbGlkIGFyZ3VtZW50cyBmb3IgZnJhbWVidWZmZXInKTtcclxuICAgICAgICB2YXIgb3B0aW9ucyA9IGE7XHJcblxyXG4gICAgICAgIGlmICgnc2hhcGUnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgIHZhciBzaGFwZSA9IG9wdGlvbnMuc2hhcGU7XHJcbiAgICAgICAgICBjaGVjayQxKEFycmF5LmlzQXJyYXkoc2hhcGUpICYmIHNoYXBlLmxlbmd0aCA+PSAyLFxyXG4gICAgICAgICAgICAnaW52YWxpZCBzaGFwZSBmb3IgZnJhbWVidWZmZXInKTtcclxuICAgICAgICAgIHdpZHRoID0gc2hhcGVbMF07XHJcbiAgICAgICAgICBoZWlnaHQgPSBzaGFwZVsxXTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgaWYgKCdyYWRpdXMnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgICAgd2lkdGggPSBoZWlnaHQgPSBvcHRpb25zLnJhZGl1cztcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGlmICgnd2lkdGgnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgICAgd2lkdGggPSBvcHRpb25zLndpZHRoO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgaWYgKCdoZWlnaHQnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgICAgaGVpZ2h0ID0gb3B0aW9ucy5oZWlnaHQ7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoJ2NvbG9yJyBpbiBvcHRpb25zIHx8XHJcbiAgICAgICAgICAgICdjb2xvcnMnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgIGNvbG9yQnVmZmVyID1cclxuICAgICAgICAgICAgb3B0aW9ucy5jb2xvciB8fFxyXG4gICAgICAgICAgICBvcHRpb25zLmNvbG9ycztcclxuICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KGNvbG9yQnVmZmVyKSkge1xyXG4gICAgICAgICAgICBjaGVjayQxKFxyXG4gICAgICAgICAgICAgIGNvbG9yQnVmZmVyLmxlbmd0aCA9PT0gMSB8fCBleHRlbnNpb25zLndlYmdsX2RyYXdfYnVmZmVycyxcclxuICAgICAgICAgICAgICAnbXVsdGlwbGUgcmVuZGVyIHRhcmdldHMgbm90IHN1cHBvcnRlZCcpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKCFjb2xvckJ1ZmZlcikge1xyXG4gICAgICAgICAgaWYgKCdjb2xvckNvdW50JyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgICAgIGNvbG9yQ291bnQgPSBvcHRpb25zLmNvbG9yQ291bnQgfCAwO1xyXG4gICAgICAgICAgICBjaGVjayQxKGNvbG9yQ291bnQgPiAwLCAnaW52YWxpZCBjb2xvciBidWZmZXIgY291bnQnKTtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICBpZiAoJ2NvbG9yVGV4dHVyZScgaW4gb3B0aW9ucykge1xyXG4gICAgICAgICAgICBjb2xvclRleHR1cmUgPSAhIW9wdGlvbnMuY29sb3JUZXh0dXJlO1xyXG4gICAgICAgICAgICBjb2xvckZvcm1hdCA9ICdyZ2JhNCc7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgaWYgKCdjb2xvclR5cGUnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgICAgY29sb3JUeXBlID0gb3B0aW9ucy5jb2xvclR5cGU7XHJcbiAgICAgICAgICAgIGlmICghY29sb3JUZXh0dXJlKSB7XHJcbiAgICAgICAgICAgICAgaWYgKGNvbG9yVHlwZSA9PT0gJ2hhbGYgZmxvYXQnIHx8IGNvbG9yVHlwZSA9PT0gJ2Zsb2F0MTYnKSB7XHJcbiAgICAgICAgICAgICAgICBjaGVjayQxKGV4dGVuc2lvbnMuZXh0X2NvbG9yX2J1ZmZlcl9oYWxmX2Zsb2F0LFxyXG4gICAgICAgICAgICAgICAgICAneW91IG11c3QgZW5hYmxlIEVYVF9jb2xvcl9idWZmZXJfaGFsZl9mbG9hdCB0byB1c2UgMTYtYml0IHJlbmRlciBidWZmZXJzJyk7XHJcbiAgICAgICAgICAgICAgICBjb2xvckZvcm1hdCA9ICdyZ2JhMTZmJztcclxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKGNvbG9yVHlwZSA9PT0gJ2Zsb2F0JyB8fCBjb2xvclR5cGUgPT09ICdmbG9hdDMyJykge1xyXG4gICAgICAgICAgICAgICAgY2hlY2skMShleHRlbnNpb25zLndlYmdsX2NvbG9yX2J1ZmZlcl9mbG9hdCxcclxuICAgICAgICAgICAgICAgICAgJ3lvdSBtdXN0IGVuYWJsZSBXRUJHTF9jb2xvcl9idWZmZXJfZmxvYXQgaW4gb3JkZXIgdG8gdXNlIDMyLWJpdCBmbG9hdGluZyBwb2ludCByZW5kZXJidWZmZXJzJyk7XHJcbiAgICAgICAgICAgICAgICBjb2xvckZvcm1hdCA9ICdyZ2JhMzJmJztcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgY2hlY2skMShleHRlbnNpb25zLm9lc190ZXh0dXJlX2Zsb2F0IHx8XHJcbiAgICAgICAgICAgICAgICAhKGNvbG9yVHlwZSA9PT0gJ2Zsb2F0JyB8fCBjb2xvclR5cGUgPT09ICdmbG9hdDMyJyksXHJcbiAgICAgICAgICAgICAgICAneW91IG11c3QgZW5hYmxlIE9FU190ZXh0dXJlX2Zsb2F0IGluIG9yZGVyIHRvIHVzZSBmbG9hdGluZyBwb2ludCBmcmFtZWJ1ZmZlciBvYmplY3RzJyk7XHJcbiAgICAgICAgICAgICAgY2hlY2skMShleHRlbnNpb25zLm9lc190ZXh0dXJlX2hhbGZfZmxvYXQgfHxcclxuICAgICAgICAgICAgICAgICEoY29sb3JUeXBlID09PSAnaGFsZiBmbG9hdCcgfHwgY29sb3JUeXBlID09PSAnZmxvYXQxNicpLFxyXG4gICAgICAgICAgICAgICAgJ3lvdSBtdXN0IGVuYWJsZSBPRVNfdGV4dHVyZV9oYWxmX2Zsb2F0IGluIG9yZGVyIHRvIHVzZSAxNi1iaXQgZmxvYXRpbmcgcG9pbnQgZnJhbWVidWZmZXIgb2JqZWN0cycpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNoZWNrJDEub25lT2YoY29sb3JUeXBlLCBjb2xvclR5cGVzLCAnaW52YWxpZCBjb2xvciB0eXBlJyk7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgaWYgKCdjb2xvckZvcm1hdCcgaW4gb3B0aW9ucykge1xyXG4gICAgICAgICAgICBjb2xvckZvcm1hdCA9IG9wdGlvbnMuY29sb3JGb3JtYXQ7XHJcbiAgICAgICAgICAgIGlmIChjb2xvclRleHR1cmVGb3JtYXRzLmluZGV4T2YoY29sb3JGb3JtYXQpID49IDApIHtcclxuICAgICAgICAgICAgICBjb2xvclRleHR1cmUgPSB0cnVlO1xyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cy5pbmRleE9mKGNvbG9yRm9ybWF0KSA+PSAwKSB7XHJcbiAgICAgICAgICAgICAgY29sb3JUZXh0dXJlID0gZmFsc2U7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgaWYgKGNvbG9yVGV4dHVyZSkge1xyXG4gICAgICAgICAgICAgICAgY2hlY2skMS5vbmVPZihcclxuICAgICAgICAgICAgICAgICAgb3B0aW9ucy5jb2xvckZvcm1hdCwgY29sb3JUZXh0dXJlRm9ybWF0cyxcclxuICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgY29sb3IgZm9ybWF0IGZvciB0ZXh0dXJlJyk7XHJcbiAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGNoZWNrJDEub25lT2YoXHJcbiAgICAgICAgICAgICAgICAgIG9wdGlvbnMuY29sb3JGb3JtYXQsIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0cyxcclxuICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgY29sb3IgZm9ybWF0IGZvciByZW5kZXJidWZmZXInKTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICgnZGVwdGhUZXh0dXJlJyBpbiBvcHRpb25zIHx8ICdkZXB0aFN0ZW5jaWxUZXh0dXJlJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgICBkZXB0aFN0ZW5jaWxUZXh0dXJlID0gISEob3B0aW9ucy5kZXB0aFRleHR1cmUgfHxcclxuICAgICAgICAgICAgb3B0aW9ucy5kZXB0aFN0ZW5jaWxUZXh0dXJlKTtcclxuICAgICAgICAgIGNoZWNrJDEoIWRlcHRoU3RlbmNpbFRleHR1cmUgfHwgZXh0ZW5zaW9ucy53ZWJnbF9kZXB0aF90ZXh0dXJlLFxyXG4gICAgICAgICAgICAnd2ViZ2xfZGVwdGhfdGV4dHVyZSBleHRlbnNpb24gbm90IHN1cHBvcnRlZCcpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKCdkZXB0aCcgaW4gb3B0aW9ucykge1xyXG4gICAgICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLmRlcHRoID09PSAnYm9vbGVhbicpIHtcclxuICAgICAgICAgICAgbmVlZHNEZXB0aCA9IG9wdGlvbnMuZGVwdGg7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBkZXB0aEJ1ZmZlciA9IG9wdGlvbnMuZGVwdGg7XHJcbiAgICAgICAgICAgIG5lZWRzU3RlbmNpbCA9IGZhbHNlO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKCdzdGVuY2lsJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgICBpZiAodHlwZW9mIG9wdGlvbnMuc3RlbmNpbCA9PT0gJ2Jvb2xlYW4nKSB7XHJcbiAgICAgICAgICAgIG5lZWRzU3RlbmNpbCA9IG9wdGlvbnMuc3RlbmNpbDtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHN0ZW5jaWxCdWZmZXIgPSBvcHRpb25zLnN0ZW5jaWw7XHJcbiAgICAgICAgICAgIG5lZWRzRGVwdGggPSBmYWxzZTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICgnZGVwdGhTdGVuY2lsJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgICBpZiAodHlwZW9mIG9wdGlvbnMuZGVwdGhTdGVuY2lsID09PSAnYm9vbGVhbicpIHtcclxuICAgICAgICAgICAgbmVlZHNEZXB0aCA9IG5lZWRzU3RlbmNpbCA9IG9wdGlvbnMuZGVwdGhTdGVuY2lsO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgZGVwdGhTdGVuY2lsQnVmZmVyID0gb3B0aW9ucy5kZXB0aFN0ZW5jaWw7XHJcbiAgICAgICAgICAgIG5lZWRzRGVwdGggPSBmYWxzZTtcclxuICAgICAgICAgICAgbmVlZHNTdGVuY2lsID0gZmFsc2U7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBwYXJzZSBhdHRhY2htZW50c1xyXG4gICAgICB2YXIgY29sb3JBdHRhY2htZW50cyA9IG51bGw7XHJcbiAgICAgIHZhciBkZXB0aEF0dGFjaG1lbnQgPSBudWxsO1xyXG4gICAgICB2YXIgc3RlbmNpbEF0dGFjaG1lbnQgPSBudWxsO1xyXG4gICAgICB2YXIgZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IG51bGw7XHJcblxyXG4gICAgICAvLyBTZXQgdXAgY29sb3IgYXR0YWNobWVudHNcclxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoY29sb3JCdWZmZXIpKSB7XHJcbiAgICAgICAgY29sb3JBdHRhY2htZW50cyA9IGNvbG9yQnVmZmVyLm1hcChwYXJzZUF0dGFjaG1lbnQpO1xyXG4gICAgICB9IGVsc2UgaWYgKGNvbG9yQnVmZmVyKSB7XHJcbiAgICAgICAgY29sb3JBdHRhY2htZW50cyA9IFtwYXJzZUF0dGFjaG1lbnQoY29sb3JCdWZmZXIpXTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBjb2xvckF0dGFjaG1lbnRzID0gbmV3IEFycmF5KGNvbG9yQ291bnQpO1xyXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckNvdW50OyArK2kpIHtcclxuICAgICAgICAgIGNvbG9yQXR0YWNobWVudHNbaV0gPSBhbGxvY0F0dGFjaG1lbnQoXHJcbiAgICAgICAgICAgIHdpZHRoLFxyXG4gICAgICAgICAgICBoZWlnaHQsXHJcbiAgICAgICAgICAgIGNvbG9yVGV4dHVyZSxcclxuICAgICAgICAgICAgY29sb3JGb3JtYXQsXHJcbiAgICAgICAgICAgIGNvbG9yVHlwZSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICBjaGVjayQxKGV4dGVuc2lvbnMud2ViZ2xfZHJhd19idWZmZXJzIHx8IGNvbG9yQXR0YWNobWVudHMubGVuZ3RoIDw9IDEsXHJcbiAgICAgICAgJ3lvdSBtdXN0IGVuYWJsZSB0aGUgV0VCR0xfZHJhd19idWZmZXJzIGV4dGVuc2lvbiBpbiBvcmRlciB0byB1c2UgbXVsdGlwbGUgY29sb3IgYnVmZmVycy4nKTtcclxuICAgICAgY2hlY2skMShjb2xvckF0dGFjaG1lbnRzLmxlbmd0aCA8PSBsaW1pdHMubWF4Q29sb3JBdHRhY2htZW50cyxcclxuICAgICAgICAndG9vIG1hbnkgY29sb3IgYXR0YWNobWVudHMsIG5vdCBzdXBwb3J0ZWQnKTtcclxuXHJcbiAgICAgIHdpZHRoID0gd2lkdGggfHwgY29sb3JBdHRhY2htZW50c1swXS53aWR0aDtcclxuICAgICAgaGVpZ2h0ID0gaGVpZ2h0IHx8IGNvbG9yQXR0YWNobWVudHNbMF0uaGVpZ2h0O1xyXG5cclxuICAgICAgaWYgKGRlcHRoQnVmZmVyKSB7XHJcbiAgICAgICAgZGVwdGhBdHRhY2htZW50ID0gcGFyc2VBdHRhY2htZW50KGRlcHRoQnVmZmVyKTtcclxuICAgICAgfSBlbHNlIGlmIChuZWVkc0RlcHRoICYmICFuZWVkc1N0ZW5jaWwpIHtcclxuICAgICAgICBkZXB0aEF0dGFjaG1lbnQgPSBhbGxvY0F0dGFjaG1lbnQoXHJcbiAgICAgICAgICB3aWR0aCxcclxuICAgICAgICAgIGhlaWdodCxcclxuICAgICAgICAgIGRlcHRoU3RlbmNpbFRleHR1cmUsXHJcbiAgICAgICAgICAnZGVwdGgnLFxyXG4gICAgICAgICAgJ3VpbnQzMicpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAoc3RlbmNpbEJ1ZmZlcikge1xyXG4gICAgICAgIHN0ZW5jaWxBdHRhY2htZW50ID0gcGFyc2VBdHRhY2htZW50KHN0ZW5jaWxCdWZmZXIpO1xyXG4gICAgICB9IGVsc2UgaWYgKG5lZWRzU3RlbmNpbCAmJiAhbmVlZHNEZXB0aCkge1xyXG4gICAgICAgIHN0ZW5jaWxBdHRhY2htZW50ID0gYWxsb2NBdHRhY2htZW50KFxyXG4gICAgICAgICAgd2lkdGgsXHJcbiAgICAgICAgICBoZWlnaHQsXHJcbiAgICAgICAgICBmYWxzZSxcclxuICAgICAgICAgICdzdGVuY2lsJyxcclxuICAgICAgICAgICd1aW50OCcpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAoZGVwdGhTdGVuY2lsQnVmZmVyKSB7XHJcbiAgICAgICAgZGVwdGhTdGVuY2lsQXR0YWNobWVudCA9IHBhcnNlQXR0YWNobWVudChkZXB0aFN0ZW5jaWxCdWZmZXIpO1xyXG4gICAgICB9IGVsc2UgaWYgKCFkZXB0aEJ1ZmZlciAmJiAhc3RlbmNpbEJ1ZmZlciAmJiBuZWVkc1N0ZW5jaWwgJiYgbmVlZHNEZXB0aCkge1xyXG4gICAgICAgIGRlcHRoU3RlbmNpbEF0dGFjaG1lbnQgPSBhbGxvY0F0dGFjaG1lbnQoXHJcbiAgICAgICAgICB3aWR0aCxcclxuICAgICAgICAgIGhlaWdodCxcclxuICAgICAgICAgIGRlcHRoU3RlbmNpbFRleHR1cmUsXHJcbiAgICAgICAgICAnZGVwdGggc3RlbmNpbCcsXHJcbiAgICAgICAgICAnZGVwdGggc3RlbmNpbCcpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjaGVjayQxKFxyXG4gICAgICAgICghIWRlcHRoQnVmZmVyKSArICghIXN0ZW5jaWxCdWZmZXIpICsgKCEhZGVwdGhTdGVuY2lsQnVmZmVyKSA8PSAxLFxyXG4gICAgICAgICdpbnZhbGlkIGZyYW1lYnVmZmVyIGNvbmZpZ3VyYXRpb24sIGNhbiBzcGVjaWZ5IGV4YWN0bHkgb25lIGRlcHRoL3N0ZW5jaWwgYXR0YWNobWVudCcpO1xyXG5cclxuICAgICAgdmFyIGNvbW1vbkNvbG9yQXR0YWNobWVudFNpemUgPSBudWxsO1xyXG5cclxuICAgICAgZm9yIChpID0gMDsgaSA8IGNvbG9yQXR0YWNobWVudHMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICBpbmNSZWZBbmRDaGVja1NoYXBlKGNvbG9yQXR0YWNobWVudHNbaV0sIHdpZHRoLCBoZWlnaHQpO1xyXG4gICAgICAgIGNoZWNrJDEoIWNvbG9yQXR0YWNobWVudHNbaV0gfHxcclxuICAgICAgICAgIChjb2xvckF0dGFjaG1lbnRzW2ldLnRleHR1cmUgJiZcclxuICAgICAgICAgICAgY29sb3JUZXh0dXJlRm9ybWF0RW51bXMuaW5kZXhPZihjb2xvckF0dGFjaG1lbnRzW2ldLnRleHR1cmUuX3RleHR1cmUuZm9ybWF0KSA+PSAwKSB8fFxyXG4gICAgICAgICAgKGNvbG9yQXR0YWNobWVudHNbaV0ucmVuZGVyYnVmZmVyICYmXHJcbiAgICAgICAgICAgIGNvbG9yUmVuZGVyYnVmZmVyRm9ybWF0RW51bXMuaW5kZXhPZihjb2xvckF0dGFjaG1lbnRzW2ldLnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyLmZvcm1hdCkgPj0gMCksXHJcbiAgICAgICAgICAnZnJhbWVidWZmZXIgY29sb3IgYXR0YWNobWVudCAnICsgaSArICcgaXMgaW52YWxpZCcpO1xyXG5cclxuICAgICAgICBpZiAoY29sb3JBdHRhY2htZW50c1tpXSAmJiBjb2xvckF0dGFjaG1lbnRzW2ldLnRleHR1cmUpIHtcclxuICAgICAgICAgIHZhciBjb2xvckF0dGFjaG1lbnRTaXplID1cclxuICAgICAgICAgICAgICB0ZXh0dXJlRm9ybWF0Q2hhbm5lbHNbY29sb3JBdHRhY2htZW50c1tpXS50ZXh0dXJlLl90ZXh0dXJlLmZvcm1hdF0gKlxyXG4gICAgICAgICAgICAgIHRleHR1cmVUeXBlU2l6ZXNbY29sb3JBdHRhY2htZW50c1tpXS50ZXh0dXJlLl90ZXh0dXJlLnR5cGVdO1xyXG5cclxuICAgICAgICAgIGlmIChjb21tb25Db2xvckF0dGFjaG1lbnRTaXplID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIGNvbW1vbkNvbG9yQXR0YWNobWVudFNpemUgPSBjb2xvckF0dGFjaG1lbnRTaXplO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gV2UgbmVlZCB0byBtYWtlIHN1cmUgdGhhdCBhbGwgY29sb3IgYXR0YWNobWVudHMgaGF2ZSB0aGUgc2FtZSBudW1iZXIgb2YgYml0cGxhbmVzXHJcbiAgICAgICAgICAgIC8vICh0aGF0IGlzLCB0aGUgc2FtZSBudW1lciBvZiBiaXRzIHBlciBwaXhlbClcclxuICAgICAgICAgICAgLy8gVGhpcyBpcyByZXF1aXJlZCBieSB0aGUgR0xFUzIuMCBzdGFuZGFyZC4gU2VlIHRoZSBiZWdpbm5pbmcgb2YgQ2hhcHRlciA0IGluIHRoYXQgZG9jdW1lbnQuXHJcbiAgICAgICAgICAgIGNoZWNrJDEoY29tbW9uQ29sb3JBdHRhY2htZW50U2l6ZSA9PT0gY29sb3JBdHRhY2htZW50U2l6ZSxcclxuICAgICAgICAgICAgICAgICAgJ2FsbCBjb2xvciBhdHRhY2htZW50cyBtdWNoIGhhdmUgdGhlIHNhbWUgbnVtYmVyIG9mIGJpdHMgcGVyIHBpeGVsLicpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICBpbmNSZWZBbmRDaGVja1NoYXBlKGRlcHRoQXR0YWNobWVudCwgd2lkdGgsIGhlaWdodCk7XHJcbiAgICAgIGNoZWNrJDEoIWRlcHRoQXR0YWNobWVudCB8fFxyXG4gICAgICAgIChkZXB0aEF0dGFjaG1lbnQudGV4dHVyZSAmJlxyXG4gICAgICAgICAgZGVwdGhBdHRhY2htZW50LnRleHR1cmUuX3RleHR1cmUuZm9ybWF0ID09PSBHTF9ERVBUSF9DT01QT05FTlQkMSkgfHxcclxuICAgICAgICAoZGVwdGhBdHRhY2htZW50LnJlbmRlcmJ1ZmZlciAmJlxyXG4gICAgICAgICAgZGVwdGhBdHRhY2htZW50LnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyLmZvcm1hdCA9PT0gR0xfREVQVEhfQ09NUE9ORU5UMTYkMSksXHJcbiAgICAgICAgJ2ludmFsaWQgZGVwdGggYXR0YWNobWVudCBmb3IgZnJhbWVidWZmZXIgb2JqZWN0Jyk7XHJcbiAgICAgIGluY1JlZkFuZENoZWNrU2hhcGUoc3RlbmNpbEF0dGFjaG1lbnQsIHdpZHRoLCBoZWlnaHQpO1xyXG4gICAgICBjaGVjayQxKCFzdGVuY2lsQXR0YWNobWVudCB8fFxyXG4gICAgICAgIChzdGVuY2lsQXR0YWNobWVudC5yZW5kZXJidWZmZXIgJiZcclxuICAgICAgICAgIHN0ZW5jaWxBdHRhY2htZW50LnJlbmRlcmJ1ZmZlci5fcmVuZGVyYnVmZmVyLmZvcm1hdCA9PT0gR0xfU1RFTkNJTF9JTkRFWDgkMSksXHJcbiAgICAgICAgJ2ludmFsaWQgc3RlbmNpbCBhdHRhY2htZW50IGZvciBmcmFtZWJ1ZmZlciBvYmplY3QnKTtcclxuICAgICAgaW5jUmVmQW5kQ2hlY2tTaGFwZShkZXB0aFN0ZW5jaWxBdHRhY2htZW50LCB3aWR0aCwgaGVpZ2h0KTtcclxuICAgICAgY2hlY2skMSghZGVwdGhTdGVuY2lsQXR0YWNobWVudCB8fFxyXG4gICAgICAgIChkZXB0aFN0ZW5jaWxBdHRhY2htZW50LnRleHR1cmUgJiZcclxuICAgICAgICAgIGRlcHRoU3RlbmNpbEF0dGFjaG1lbnQudGV4dHVyZS5fdGV4dHVyZS5mb3JtYXQgPT09IEdMX0RFUFRIX1NURU5DSUwkMikgfHxcclxuICAgICAgICAoZGVwdGhTdGVuY2lsQXR0YWNobWVudC5yZW5kZXJidWZmZXIgJiZcclxuICAgICAgICAgIGRlcHRoU3RlbmNpbEF0dGFjaG1lbnQucmVuZGVyYnVmZmVyLl9yZW5kZXJidWZmZXIuZm9ybWF0ID09PSBHTF9ERVBUSF9TVEVOQ0lMJDIpLFxyXG4gICAgICAgICdpbnZhbGlkIGRlcHRoLXN0ZW5jaWwgYXR0YWNobWVudCBmb3IgZnJhbWVidWZmZXIgb2JqZWN0Jyk7XHJcblxyXG4gICAgICAvLyBkZWNyZW1lbnQgcmVmZXJlbmNlc1xyXG4gICAgICBkZWNGQk9SZWZzKGZyYW1lYnVmZmVyKTtcclxuXHJcbiAgICAgIGZyYW1lYnVmZmVyLndpZHRoID0gd2lkdGg7XHJcbiAgICAgIGZyYW1lYnVmZmVyLmhlaWdodCA9IGhlaWdodDtcclxuXHJcbiAgICAgIGZyYW1lYnVmZmVyLmNvbG9yQXR0YWNobWVudHMgPSBjb2xvckF0dGFjaG1lbnRzO1xyXG4gICAgICBmcmFtZWJ1ZmZlci5kZXB0aEF0dGFjaG1lbnQgPSBkZXB0aEF0dGFjaG1lbnQ7XHJcbiAgICAgIGZyYW1lYnVmZmVyLnN0ZW5jaWxBdHRhY2htZW50ID0gc3RlbmNpbEF0dGFjaG1lbnQ7XHJcbiAgICAgIGZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbEF0dGFjaG1lbnQgPSBkZXB0aFN0ZW5jaWxBdHRhY2htZW50O1xyXG5cclxuICAgICAgcmVnbEZyYW1lYnVmZmVyLmNvbG9yID0gY29sb3JBdHRhY2htZW50cy5tYXAodW53cmFwQXR0YWNobWVudCk7XHJcbiAgICAgIHJlZ2xGcmFtZWJ1ZmZlci5kZXB0aCA9IHVud3JhcEF0dGFjaG1lbnQoZGVwdGhBdHRhY2htZW50KTtcclxuICAgICAgcmVnbEZyYW1lYnVmZmVyLnN0ZW5jaWwgPSB1bndyYXBBdHRhY2htZW50KHN0ZW5jaWxBdHRhY2htZW50KTtcclxuICAgICAgcmVnbEZyYW1lYnVmZmVyLmRlcHRoU3RlbmNpbCA9IHVud3JhcEF0dGFjaG1lbnQoZGVwdGhTdGVuY2lsQXR0YWNobWVudCk7XHJcblxyXG4gICAgICByZWdsRnJhbWVidWZmZXIud2lkdGggPSBmcmFtZWJ1ZmZlci53aWR0aDtcclxuICAgICAgcmVnbEZyYW1lYnVmZmVyLmhlaWdodCA9IGZyYW1lYnVmZmVyLmhlaWdodDtcclxuXHJcbiAgICAgIHVwZGF0ZUZyYW1lYnVmZmVyKGZyYW1lYnVmZmVyKTtcclxuXHJcbiAgICAgIHJldHVybiByZWdsRnJhbWVidWZmZXJcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiByZXNpemUgKHdfLCBoXykge1xyXG4gICAgICBjaGVjayQxKGZyYW1lYnVmZmVyU3RhdGUubmV4dCAhPT0gZnJhbWVidWZmZXIsXHJcbiAgICAgICAgJ2NhbiBub3QgcmVzaXplIGEgZnJhbWVidWZmZXIgd2hpY2ggaXMgY3VycmVudGx5IGluIHVzZScpO1xyXG5cclxuICAgICAgdmFyIHcgPSBNYXRoLm1heCh3XyB8IDAsIDEpO1xyXG4gICAgICB2YXIgaCA9IE1hdGgubWF4KChoXyB8IDApIHx8IHcsIDEpO1xyXG4gICAgICBpZiAodyA9PT0gZnJhbWVidWZmZXIud2lkdGggJiYgaCA9PT0gZnJhbWVidWZmZXIuaGVpZ2h0KSB7XHJcbiAgICAgICAgcmV0dXJuIHJlZ2xGcmFtZWJ1ZmZlclxyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyByZXNpemUgYWxsIGJ1ZmZlcnNcclxuICAgICAgdmFyIGNvbG9yQXR0YWNobWVudHMgPSBmcmFtZWJ1ZmZlci5jb2xvckF0dGFjaG1lbnRzO1xyXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNvbG9yQXR0YWNobWVudHMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICByZXNpemVBdHRhY2htZW50KGNvbG9yQXR0YWNobWVudHNbaV0sIHcsIGgpO1xyXG4gICAgICB9XHJcbiAgICAgIHJlc2l6ZUF0dGFjaG1lbnQoZnJhbWVidWZmZXIuZGVwdGhBdHRhY2htZW50LCB3LCBoKTtcclxuICAgICAgcmVzaXplQXR0YWNobWVudChmcmFtZWJ1ZmZlci5zdGVuY2lsQXR0YWNobWVudCwgdywgaCk7XHJcbiAgICAgIHJlc2l6ZUF0dGFjaG1lbnQoZnJhbWVidWZmZXIuZGVwdGhTdGVuY2lsQXR0YWNobWVudCwgdywgaCk7XHJcblxyXG4gICAgICBmcmFtZWJ1ZmZlci53aWR0aCA9IHJlZ2xGcmFtZWJ1ZmZlci53aWR0aCA9IHc7XHJcbiAgICAgIGZyYW1lYnVmZmVyLmhlaWdodCA9IHJlZ2xGcmFtZWJ1ZmZlci5oZWlnaHQgPSBoO1xyXG5cclxuICAgICAgdXBkYXRlRnJhbWVidWZmZXIoZnJhbWVidWZmZXIpO1xyXG5cclxuICAgICAgcmV0dXJuIHJlZ2xGcmFtZWJ1ZmZlclxyXG4gICAgfVxyXG5cclxuICAgIHJlZ2xGcmFtZWJ1ZmZlcihhMCwgYTEpO1xyXG5cclxuICAgIHJldHVybiBleHRlbmQocmVnbEZyYW1lYnVmZmVyLCB7XHJcbiAgICAgIHJlc2l6ZTogcmVzaXplLFxyXG4gICAgICBfcmVnbFR5cGU6ICdmcmFtZWJ1ZmZlcicsXHJcbiAgICAgIF9mcmFtZWJ1ZmZlcjogZnJhbWVidWZmZXIsXHJcbiAgICAgIGRlc3Ryb3k6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICBkZXN0cm95KGZyYW1lYnVmZmVyKTtcclxuICAgICAgICBkZWNGQk9SZWZzKGZyYW1lYnVmZmVyKTtcclxuICAgICAgfSxcclxuICAgICAgdXNlOiBmdW5jdGlvbiAoYmxvY2spIHtcclxuICAgICAgICBmcmFtZWJ1ZmZlclN0YXRlLnNldEZCTyh7XHJcbiAgICAgICAgICBmcmFtZWJ1ZmZlcjogcmVnbEZyYW1lYnVmZmVyXHJcbiAgICAgICAgfSwgYmxvY2spO1xyXG4gICAgICB9XHJcbiAgICB9KVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gY3JlYXRlQ3ViZUZCTyAob3B0aW9ucykge1xyXG4gICAgdmFyIGZhY2VzID0gQXJyYXkoNik7XHJcblxyXG4gICAgZnVuY3Rpb24gcmVnbEZyYW1lYnVmZmVyQ3ViZSAoYSkge1xyXG4gICAgICB2YXIgaTtcclxuXHJcbiAgICAgIGNoZWNrJDEoZmFjZXMuaW5kZXhPZihmcmFtZWJ1ZmZlclN0YXRlLm5leHQpIDwgMCxcclxuICAgICAgICAnY2FuIG5vdCB1cGRhdGUgZnJhbWVidWZmZXIgd2hpY2ggaXMgY3VycmVudGx5IGluIHVzZScpO1xyXG5cclxuICAgICAgdmFyIHBhcmFtcyA9IHtcclxuICAgICAgICBjb2xvcjogbnVsbFxyXG4gICAgICB9O1xyXG5cclxuICAgICAgdmFyIHJhZGl1cyA9IDA7XHJcblxyXG4gICAgICB2YXIgY29sb3JCdWZmZXIgPSBudWxsO1xyXG4gICAgICB2YXIgY29sb3JGb3JtYXQgPSAncmdiYSc7XHJcbiAgICAgIHZhciBjb2xvclR5cGUgPSAndWludDgnO1xyXG4gICAgICB2YXIgY29sb3JDb3VudCA9IDE7XHJcblxyXG4gICAgICBpZiAodHlwZW9mIGEgPT09ICdudW1iZXInKSB7XHJcbiAgICAgICAgcmFkaXVzID0gYSB8IDA7XHJcbiAgICAgIH0gZWxzZSBpZiAoIWEpIHtcclxuICAgICAgICByYWRpdXMgPSAxO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNoZWNrJDEudHlwZShhLCAnb2JqZWN0JywgJ2ludmFsaWQgYXJndW1lbnRzIGZvciBmcmFtZWJ1ZmZlcicpO1xyXG4gICAgICAgIHZhciBvcHRpb25zID0gYTtcclxuXHJcbiAgICAgICAgaWYgKCdzaGFwZScgaW4gb3B0aW9ucykge1xyXG4gICAgICAgICAgdmFyIHNoYXBlID0gb3B0aW9ucy5zaGFwZTtcclxuICAgICAgICAgIGNoZWNrJDEoXHJcbiAgICAgICAgICAgIEFycmF5LmlzQXJyYXkoc2hhcGUpICYmIHNoYXBlLmxlbmd0aCA+PSAyLFxyXG4gICAgICAgICAgICAnaW52YWxpZCBzaGFwZSBmb3IgZnJhbWVidWZmZXInKTtcclxuICAgICAgICAgIGNoZWNrJDEoXHJcbiAgICAgICAgICAgIHNoYXBlWzBdID09PSBzaGFwZVsxXSxcclxuICAgICAgICAgICAgJ2N1YmUgZnJhbWVidWZmZXIgbXVzdCBiZSBzcXVhcmUnKTtcclxuICAgICAgICAgIHJhZGl1cyA9IHNoYXBlWzBdO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBpZiAoJ3JhZGl1cycgaW4gb3B0aW9ucykge1xyXG4gICAgICAgICAgICByYWRpdXMgPSBvcHRpb25zLnJhZGl1cyB8IDA7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBpZiAoJ3dpZHRoJyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgICAgIHJhZGl1cyA9IG9wdGlvbnMud2lkdGggfCAwO1xyXG4gICAgICAgICAgICBpZiAoJ2hlaWdodCcgaW4gb3B0aW9ucykge1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEob3B0aW9ucy5oZWlnaHQgPT09IHJhZGl1cywgJ211c3QgYmUgc3F1YXJlJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0gZWxzZSBpZiAoJ2hlaWdodCcgaW4gb3B0aW9ucykge1xyXG4gICAgICAgICAgICByYWRpdXMgPSBvcHRpb25zLmhlaWdodCB8IDA7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoJ2NvbG9yJyBpbiBvcHRpb25zIHx8XHJcbiAgICAgICAgICAgICdjb2xvcnMnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgIGNvbG9yQnVmZmVyID1cclxuICAgICAgICAgICAgb3B0aW9ucy5jb2xvciB8fFxyXG4gICAgICAgICAgICBvcHRpb25zLmNvbG9ycztcclxuICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KGNvbG9yQnVmZmVyKSkge1xyXG4gICAgICAgICAgICBjaGVjayQxKFxyXG4gICAgICAgICAgICAgIGNvbG9yQnVmZmVyLmxlbmd0aCA9PT0gMSB8fCBleHRlbnNpb25zLndlYmdsX2RyYXdfYnVmZmVycyxcclxuICAgICAgICAgICAgICAnbXVsdGlwbGUgcmVuZGVyIHRhcmdldHMgbm90IHN1cHBvcnRlZCcpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKCFjb2xvckJ1ZmZlcikge1xyXG4gICAgICAgICAgaWYgKCdjb2xvckNvdW50JyBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgICAgIGNvbG9yQ291bnQgPSBvcHRpb25zLmNvbG9yQ291bnQgfCAwO1xyXG4gICAgICAgICAgICBjaGVjayQxKGNvbG9yQ291bnQgPiAwLCAnaW52YWxpZCBjb2xvciBidWZmZXIgY291bnQnKTtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICBpZiAoJ2NvbG9yVHlwZScgaW4gb3B0aW9ucykge1xyXG4gICAgICAgICAgICBjaGVjayQxLm9uZU9mKFxyXG4gICAgICAgICAgICAgIG9wdGlvbnMuY29sb3JUeXBlLCBjb2xvclR5cGVzLFxyXG4gICAgICAgICAgICAgICdpbnZhbGlkIGNvbG9yIHR5cGUnKTtcclxuICAgICAgICAgICAgY29sb3JUeXBlID0gb3B0aW9ucy5jb2xvclR5cGU7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgaWYgKCdjb2xvckZvcm1hdCcgaW4gb3B0aW9ucykge1xyXG4gICAgICAgICAgICBjb2xvckZvcm1hdCA9IG9wdGlvbnMuY29sb3JGb3JtYXQ7XHJcbiAgICAgICAgICAgIGNoZWNrJDEub25lT2YoXHJcbiAgICAgICAgICAgICAgb3B0aW9ucy5jb2xvckZvcm1hdCwgY29sb3JUZXh0dXJlRm9ybWF0cyxcclxuICAgICAgICAgICAgICAnaW52YWxpZCBjb2xvciBmb3JtYXQgZm9yIHRleHR1cmUnKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICgnZGVwdGgnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgIHBhcmFtcy5kZXB0aCA9IG9wdGlvbnMuZGVwdGg7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoJ3N0ZW5jaWwnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgIHBhcmFtcy5zdGVuY2lsID0gb3B0aW9ucy5zdGVuY2lsO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKCdkZXB0aFN0ZW5jaWwnIGluIG9wdGlvbnMpIHtcclxuICAgICAgICAgIHBhcmFtcy5kZXB0aFN0ZW5jaWwgPSBvcHRpb25zLmRlcHRoU3RlbmNpbDtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHZhciBjb2xvckN1YmVzO1xyXG4gICAgICBpZiAoY29sb3JCdWZmZXIpIHtcclxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShjb2xvckJ1ZmZlcikpIHtcclxuICAgICAgICAgIGNvbG9yQ3ViZXMgPSBbXTtcclxuICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvckJ1ZmZlci5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgICAgICBjb2xvckN1YmVzW2ldID0gY29sb3JCdWZmZXJbaV07XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGNvbG9yQ3ViZXMgPSBbIGNvbG9yQnVmZmVyIF07XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNvbG9yQ3ViZXMgPSBBcnJheShjb2xvckNvdW50KTtcclxuICAgICAgICB2YXIgY3ViZU1hcFBhcmFtcyA9IHtcclxuICAgICAgICAgIHJhZGl1czogcmFkaXVzLFxyXG4gICAgICAgICAgZm9ybWF0OiBjb2xvckZvcm1hdCxcclxuICAgICAgICAgIHR5cGU6IGNvbG9yVHlwZVxyXG4gICAgICAgIH07XHJcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvbG9yQ291bnQ7ICsraSkge1xyXG4gICAgICAgICAgY29sb3JDdWJlc1tpXSA9IHRleHR1cmVTdGF0ZS5jcmVhdGVDdWJlKGN1YmVNYXBQYXJhbXMpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gQ2hlY2sgY29sb3IgY3ViZXNcclxuICAgICAgcGFyYW1zLmNvbG9yID0gQXJyYXkoY29sb3JDdWJlcy5sZW5ndGgpO1xyXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgY29sb3JDdWJlcy5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgIHZhciBjdWJlID0gY29sb3JDdWJlc1tpXTtcclxuICAgICAgICBjaGVjayQxKFxyXG4gICAgICAgICAgdHlwZW9mIGN1YmUgPT09ICdmdW5jdGlvbicgJiYgY3ViZS5fcmVnbFR5cGUgPT09ICd0ZXh0dXJlQ3ViZScsXHJcbiAgICAgICAgICAnaW52YWxpZCBjdWJlIG1hcCcpO1xyXG4gICAgICAgIHJhZGl1cyA9IHJhZGl1cyB8fCBjdWJlLndpZHRoO1xyXG4gICAgICAgIGNoZWNrJDEoXHJcbiAgICAgICAgICBjdWJlLndpZHRoID09PSByYWRpdXMgJiYgY3ViZS5oZWlnaHQgPT09IHJhZGl1cyxcclxuICAgICAgICAgICdpbnZhbGlkIGN1YmUgbWFwIHNoYXBlJyk7XHJcbiAgICAgICAgcGFyYW1zLmNvbG9yW2ldID0ge1xyXG4gICAgICAgICAgdGFyZ2V0OiBHTF9URVhUVVJFX0NVQkVfTUFQX1BPU0lUSVZFX1gkMixcclxuICAgICAgICAgIGRhdGE6IGNvbG9yQ3ViZXNbaV1cclxuICAgICAgICB9O1xyXG4gICAgICB9XHJcblxyXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgNjsgKytpKSB7XHJcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBjb2xvckN1YmVzLmxlbmd0aDsgKytqKSB7XHJcbiAgICAgICAgICBwYXJhbXMuY29sb3Jbal0udGFyZ2V0ID0gR0xfVEVYVFVSRV9DVUJFX01BUF9QT1NJVElWRV9YJDIgKyBpO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyByZXVzZSBkZXB0aC1zdGVuY2lsIGF0dGFjaG1lbnRzIGFjcm9zcyBhbGwgY3ViZSBtYXBzXHJcbiAgICAgICAgaWYgKGkgPiAwKSB7XHJcbiAgICAgICAgICBwYXJhbXMuZGVwdGggPSBmYWNlc1swXS5kZXB0aDtcclxuICAgICAgICAgIHBhcmFtcy5zdGVuY2lsID0gZmFjZXNbMF0uc3RlbmNpbDtcclxuICAgICAgICAgIHBhcmFtcy5kZXB0aFN0ZW5jaWwgPSBmYWNlc1swXS5kZXB0aFN0ZW5jaWw7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChmYWNlc1tpXSkge1xyXG4gICAgICAgICAgKGZhY2VzW2ldKShwYXJhbXMpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBmYWNlc1tpXSA9IGNyZWF0ZUZCTyhwYXJhbXMpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuIGV4dGVuZChyZWdsRnJhbWVidWZmZXJDdWJlLCB7XHJcbiAgICAgICAgd2lkdGg6IHJhZGl1cyxcclxuICAgICAgICBoZWlnaHQ6IHJhZGl1cyxcclxuICAgICAgICBjb2xvcjogY29sb3JDdWJlc1xyXG4gICAgICB9KVxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHJlc2l6ZSAocmFkaXVzXykge1xyXG4gICAgICB2YXIgaTtcclxuICAgICAgdmFyIHJhZGl1cyA9IHJhZGl1c18gfCAwO1xyXG4gICAgICBjaGVjayQxKHJhZGl1cyA+IDAgJiYgcmFkaXVzIDw9IGxpbWl0cy5tYXhDdWJlTWFwU2l6ZSxcclxuICAgICAgICAnaW52YWxpZCByYWRpdXMgZm9yIGN1YmUgZmJvJyk7XHJcblxyXG4gICAgICBpZiAocmFkaXVzID09PSByZWdsRnJhbWVidWZmZXJDdWJlLndpZHRoKSB7XHJcbiAgICAgICAgcmV0dXJuIHJlZ2xGcmFtZWJ1ZmZlckN1YmVcclxuICAgICAgfVxyXG5cclxuICAgICAgdmFyIGNvbG9ycyA9IHJlZ2xGcmFtZWJ1ZmZlckN1YmUuY29sb3I7XHJcbiAgICAgIGZvciAoaSA9IDA7IGkgPCBjb2xvcnMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICBjb2xvcnNbaV0ucmVzaXplKHJhZGl1cyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGZvciAoaSA9IDA7IGkgPCA2OyArK2kpIHtcclxuICAgICAgICBmYWNlc1tpXS5yZXNpemUocmFkaXVzKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgcmVnbEZyYW1lYnVmZmVyQ3ViZS53aWR0aCA9IHJlZ2xGcmFtZWJ1ZmZlckN1YmUuaGVpZ2h0ID0gcmFkaXVzO1xyXG5cclxuICAgICAgcmV0dXJuIHJlZ2xGcmFtZWJ1ZmZlckN1YmVcclxuICAgIH1cclxuXHJcbiAgICByZWdsRnJhbWVidWZmZXJDdWJlKG9wdGlvbnMpO1xyXG5cclxuICAgIHJldHVybiBleHRlbmQocmVnbEZyYW1lYnVmZmVyQ3ViZSwge1xyXG4gICAgICBmYWNlczogZmFjZXMsXHJcbiAgICAgIHJlc2l6ZTogcmVzaXplLFxyXG4gICAgICBfcmVnbFR5cGU6ICdmcmFtZWJ1ZmZlckN1YmUnLFxyXG4gICAgICBkZXN0cm95OiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgZmFjZXMuZm9yRWFjaChmdW5jdGlvbiAoZikge1xyXG4gICAgICAgICAgZi5kZXN0cm95KCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICAgIH0pXHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiByZXN0b3JlRnJhbWVidWZmZXJzICgpIHtcclxuICAgIGZyYW1lYnVmZmVyU3RhdGUuY3VyID0gbnVsbDtcclxuICAgIGZyYW1lYnVmZmVyU3RhdGUubmV4dCA9IG51bGw7XHJcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLmRpcnR5ID0gdHJ1ZTtcclxuICAgIHZhbHVlcyhmcmFtZWJ1ZmZlclNldCkuZm9yRWFjaChmdW5jdGlvbiAoZmIpIHtcclxuICAgICAgZmIuZnJhbWVidWZmZXIgPSBnbC5jcmVhdGVGcmFtZWJ1ZmZlcigpO1xyXG4gICAgICB1cGRhdGVGcmFtZWJ1ZmZlcihmYik7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIHJldHVybiBleHRlbmQoZnJhbWVidWZmZXJTdGF0ZSwge1xyXG4gICAgZ2V0RnJhbWVidWZmZXI6IGZ1bmN0aW9uIChvYmplY3QpIHtcclxuICAgICAgaWYgKHR5cGVvZiBvYmplY3QgPT09ICdmdW5jdGlvbicgJiYgb2JqZWN0Ll9yZWdsVHlwZSA9PT0gJ2ZyYW1lYnVmZmVyJykge1xyXG4gICAgICAgIHZhciBmYm8gPSBvYmplY3QuX2ZyYW1lYnVmZmVyO1xyXG4gICAgICAgIGlmIChmYm8gaW5zdGFuY2VvZiBSRUdMRnJhbWVidWZmZXIpIHtcclxuICAgICAgICAgIHJldHVybiBmYm9cclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIG51bGxcclxuICAgIH0sXHJcbiAgICBjcmVhdGU6IGNyZWF0ZUZCTyxcclxuICAgIGNyZWF0ZUN1YmU6IGNyZWF0ZUN1YmVGQk8sXHJcbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xyXG4gICAgICB2YWx1ZXMoZnJhbWVidWZmZXJTZXQpLmZvckVhY2goZGVzdHJveSk7XHJcbiAgICB9LFxyXG4gICAgcmVzdG9yZTogcmVzdG9yZUZyYW1lYnVmZmVyc1xyXG4gIH0pXHJcbn1cblxudmFyIEdMX0ZMT0FUJDYgPSA1MTI2O1xyXG5cclxuZnVuY3Rpb24gQXR0cmlidXRlUmVjb3JkICgpIHtcclxuICB0aGlzLnN0YXRlID0gMDtcclxuXHJcbiAgdGhpcy54ID0gMC4wO1xyXG4gIHRoaXMueSA9IDAuMDtcclxuICB0aGlzLnogPSAwLjA7XHJcbiAgdGhpcy53ID0gMC4wO1xyXG5cclxuICB0aGlzLmJ1ZmZlciA9IG51bGw7XHJcbiAgdGhpcy5zaXplID0gMDtcclxuICB0aGlzLm5vcm1hbGl6ZWQgPSBmYWxzZTtcclxuICB0aGlzLnR5cGUgPSBHTF9GTE9BVCQ2O1xyXG4gIHRoaXMub2Zmc2V0ID0gMDtcclxuICB0aGlzLnN0cmlkZSA9IDA7XHJcbiAgdGhpcy5kaXZpc29yID0gMDtcclxufVxyXG5cclxuZnVuY3Rpb24gd3JhcEF0dHJpYnV0ZVN0YXRlIChcclxuICBnbCxcclxuICBleHRlbnNpb25zLFxyXG4gIGxpbWl0cyxcclxuICBzdHJpbmdTdG9yZSkge1xyXG4gIHZhciBOVU1fQVRUUklCVVRFUyA9IGxpbWl0cy5tYXhBdHRyaWJ1dGVzO1xyXG4gIHZhciBhdHRyaWJ1dGVCaW5kaW5ncyA9IG5ldyBBcnJheShOVU1fQVRUUklCVVRFUyk7XHJcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBOVU1fQVRUUklCVVRFUzsgKytpKSB7XHJcbiAgICBhdHRyaWJ1dGVCaW5kaW5nc1tpXSA9IG5ldyBBdHRyaWJ1dGVSZWNvcmQoKTtcclxuICB9XHJcblxyXG4gIHJldHVybiB7XHJcbiAgICBSZWNvcmQ6IEF0dHJpYnV0ZVJlY29yZCxcclxuICAgIHNjb3BlOiB7fSxcclxuICAgIHN0YXRlOiBhdHRyaWJ1dGVCaW5kaW5nc1xyXG4gIH1cclxufVxuXG52YXIgR0xfRlJBR01FTlRfU0hBREVSID0gMzU2MzI7XHJcbnZhciBHTF9WRVJURVhfU0hBREVSID0gMzU2MzM7XHJcblxyXG52YXIgR0xfQUNUSVZFX1VOSUZPUk1TID0gMHg4Qjg2O1xyXG52YXIgR0xfQUNUSVZFX0FUVFJJQlVURVMgPSAweDhCODk7XHJcblxyXG5mdW5jdGlvbiB3cmFwU2hhZGVyU3RhdGUgKGdsLCBzdHJpbmdTdG9yZSwgc3RhdHMsIGNvbmZpZykge1xyXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gIC8vIGdsc2wgY29tcGlsYXRpb24gYW5kIGxpbmtpbmdcclxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICB2YXIgZnJhZ1NoYWRlcnMgPSB7fTtcclxuICB2YXIgdmVydFNoYWRlcnMgPSB7fTtcclxuXHJcbiAgZnVuY3Rpb24gQWN0aXZlSW5mbyAobmFtZSwgaWQsIGxvY2F0aW9uLCBpbmZvKSB7XHJcbiAgICB0aGlzLm5hbWUgPSBuYW1lO1xyXG4gICAgdGhpcy5pZCA9IGlkO1xyXG4gICAgdGhpcy5sb2NhdGlvbiA9IGxvY2F0aW9uO1xyXG4gICAgdGhpcy5pbmZvID0gaW5mbztcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGluc2VydEFjdGl2ZUluZm8gKGxpc3QsIGluZm8pIHtcclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7ICsraSkge1xyXG4gICAgICBpZiAobGlzdFtpXS5pZCA9PT0gaW5mby5pZCkge1xyXG4gICAgICAgIGxpc3RbaV0ubG9jYXRpb24gPSBpbmZvLmxvY2F0aW9uO1xyXG4gICAgICAgIHJldHVyblxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBsaXN0LnB1c2goaW5mbyk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBnZXRTaGFkZXIgKHR5cGUsIGlkLCBjb21tYW5kKSB7XHJcbiAgICB2YXIgY2FjaGUgPSB0eXBlID09PSBHTF9GUkFHTUVOVF9TSEFERVIgPyBmcmFnU2hhZGVycyA6IHZlcnRTaGFkZXJzO1xyXG4gICAgdmFyIHNoYWRlciA9IGNhY2hlW2lkXTtcclxuXHJcbiAgICBpZiAoIXNoYWRlcikge1xyXG4gICAgICB2YXIgc291cmNlID0gc3RyaW5nU3RvcmUuc3RyKGlkKTtcclxuICAgICAgc2hhZGVyID0gZ2wuY3JlYXRlU2hhZGVyKHR5cGUpO1xyXG4gICAgICBnbC5zaGFkZXJTb3VyY2Uoc2hhZGVyLCBzb3VyY2UpO1xyXG4gICAgICBnbC5jb21waWxlU2hhZGVyKHNoYWRlcik7XHJcbiAgICAgIGNoZWNrJDEuc2hhZGVyRXJyb3IoZ2wsIHNoYWRlciwgc291cmNlLCB0eXBlLCBjb21tYW5kKTtcclxuICAgICAgY2FjaGVbaWRdID0gc2hhZGVyO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBzaGFkZXJcclxuICB9XHJcblxyXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gIC8vIHByb2dyYW0gbGlua2luZ1xyXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gIHZhciBwcm9ncmFtQ2FjaGUgPSB7fTtcclxuICB2YXIgcHJvZ3JhbUxpc3QgPSBbXTtcclxuXHJcbiAgdmFyIFBST0dSQU1fQ09VTlRFUiA9IDA7XHJcblxyXG4gIGZ1bmN0aW9uIFJFR0xQcm9ncmFtIChmcmFnSWQsIHZlcnRJZCkge1xyXG4gICAgdGhpcy5pZCA9IFBST0dSQU1fQ09VTlRFUisrO1xyXG4gICAgdGhpcy5mcmFnSWQgPSBmcmFnSWQ7XHJcbiAgICB0aGlzLnZlcnRJZCA9IHZlcnRJZDtcclxuICAgIHRoaXMucHJvZ3JhbSA9IG51bGw7XHJcbiAgICB0aGlzLnVuaWZvcm1zID0gW107XHJcbiAgICB0aGlzLmF0dHJpYnV0ZXMgPSBbXTtcclxuXHJcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcclxuICAgICAgdGhpcy5zdGF0cyA9IHtcclxuICAgICAgICB1bmlmb3Jtc0NvdW50OiAwLFxyXG4gICAgICAgIGF0dHJpYnV0ZXNDb3VudDogMFxyXG4gICAgICB9O1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gbGlua1Byb2dyYW0gKGRlc2MsIGNvbW1hbmQpIHtcclxuICAgIHZhciBpLCBpbmZvO1xyXG5cclxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICAgIC8vIGNvbXBpbGUgJiBsaW5rXHJcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgICB2YXIgZnJhZ1NoYWRlciA9IGdldFNoYWRlcihHTF9GUkFHTUVOVF9TSEFERVIsIGRlc2MuZnJhZ0lkKTtcclxuICAgIHZhciB2ZXJ0U2hhZGVyID0gZ2V0U2hhZGVyKEdMX1ZFUlRFWF9TSEFERVIsIGRlc2MudmVydElkKTtcclxuXHJcbiAgICB2YXIgcHJvZ3JhbSA9IGRlc2MucHJvZ3JhbSA9IGdsLmNyZWF0ZVByb2dyYW0oKTtcclxuICAgIGdsLmF0dGFjaFNoYWRlcihwcm9ncmFtLCBmcmFnU2hhZGVyKTtcclxuICAgIGdsLmF0dGFjaFNoYWRlcihwcm9ncmFtLCB2ZXJ0U2hhZGVyKTtcclxuICAgIGdsLmxpbmtQcm9ncmFtKHByb2dyYW0pO1xyXG4gICAgY2hlY2skMS5saW5rRXJyb3IoXHJcbiAgICAgIGdsLFxyXG4gICAgICBwcm9ncmFtLFxyXG4gICAgICBzdHJpbmdTdG9yZS5zdHIoZGVzYy5mcmFnSWQpLFxyXG4gICAgICBzdHJpbmdTdG9yZS5zdHIoZGVzYy52ZXJ0SWQpLFxyXG4gICAgICBjb21tYW5kKTtcclxuXHJcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgICAvLyBncmFiIHVuaWZvcm1zXHJcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgICB2YXIgbnVtVW5pZm9ybXMgPSBnbC5nZXRQcm9ncmFtUGFyYW1ldGVyKHByb2dyYW0sIEdMX0FDVElWRV9VTklGT1JNUyk7XHJcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcclxuICAgICAgZGVzYy5zdGF0cy51bmlmb3Jtc0NvdW50ID0gbnVtVW5pZm9ybXM7XHJcbiAgICB9XHJcbiAgICB2YXIgdW5pZm9ybXMgPSBkZXNjLnVuaWZvcm1zO1xyXG4gICAgZm9yIChpID0gMDsgaSA8IG51bVVuaWZvcm1zOyArK2kpIHtcclxuICAgICAgaW5mbyA9IGdsLmdldEFjdGl2ZVVuaWZvcm0ocHJvZ3JhbSwgaSk7XHJcbiAgICAgIGlmIChpbmZvKSB7XHJcbiAgICAgICAgaWYgKGluZm8uc2l6ZSA+IDEpIHtcclxuICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgaW5mby5zaXplOyArK2opIHtcclxuICAgICAgICAgICAgdmFyIG5hbWUgPSBpbmZvLm5hbWUucmVwbGFjZSgnWzBdJywgJ1snICsgaiArICddJyk7XHJcbiAgICAgICAgICAgIGluc2VydEFjdGl2ZUluZm8odW5pZm9ybXMsIG5ldyBBY3RpdmVJbmZvKFxyXG4gICAgICAgICAgICAgIG5hbWUsXHJcbiAgICAgICAgICAgICAgc3RyaW5nU3RvcmUuaWQobmFtZSksXHJcbiAgICAgICAgICAgICAgZ2wuZ2V0VW5pZm9ybUxvY2F0aW9uKHByb2dyYW0sIG5hbWUpLFxyXG4gICAgICAgICAgICAgIGluZm8pKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgaW5zZXJ0QWN0aXZlSW5mbyh1bmlmb3JtcywgbmV3IEFjdGl2ZUluZm8oXHJcbiAgICAgICAgICAgIGluZm8ubmFtZSxcclxuICAgICAgICAgICAgc3RyaW5nU3RvcmUuaWQoaW5mby5uYW1lKSxcclxuICAgICAgICAgICAgZ2wuZ2V0VW5pZm9ybUxvY2F0aW9uKHByb2dyYW0sIGluZm8ubmFtZSksXHJcbiAgICAgICAgICAgIGluZm8pKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgICAvLyBncmFiIGF0dHJpYnV0ZXNcclxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICAgIHZhciBudW1BdHRyaWJ1dGVzID0gZ2wuZ2V0UHJvZ3JhbVBhcmFtZXRlcihwcm9ncmFtLCBHTF9BQ1RJVkVfQVRUUklCVVRFUyk7XHJcbiAgICBpZiAoY29uZmlnLnByb2ZpbGUpIHtcclxuICAgICAgZGVzYy5zdGF0cy5hdHRyaWJ1dGVzQ291bnQgPSBudW1BdHRyaWJ1dGVzO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBhdHRyaWJ1dGVzID0gZGVzYy5hdHRyaWJ1dGVzO1xyXG4gICAgZm9yIChpID0gMDsgaSA8IG51bUF0dHJpYnV0ZXM7ICsraSkge1xyXG4gICAgICBpbmZvID0gZ2wuZ2V0QWN0aXZlQXR0cmliKHByb2dyYW0sIGkpO1xyXG4gICAgICBpZiAoaW5mbykge1xyXG4gICAgICAgIGluc2VydEFjdGl2ZUluZm8oYXR0cmlidXRlcywgbmV3IEFjdGl2ZUluZm8oXHJcbiAgICAgICAgICBpbmZvLm5hbWUsXHJcbiAgICAgICAgICBzdHJpbmdTdG9yZS5pZChpbmZvLm5hbWUpLFxyXG4gICAgICAgICAgZ2wuZ2V0QXR0cmliTG9jYXRpb24ocHJvZ3JhbSwgaW5mby5uYW1lKSxcclxuICAgICAgICAgIGluZm8pKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgaWYgKGNvbmZpZy5wcm9maWxlKSB7XHJcbiAgICBzdGF0cy5nZXRNYXhVbmlmb3Jtc0NvdW50ID0gZnVuY3Rpb24gKCkge1xyXG4gICAgICB2YXIgbSA9IDA7XHJcbiAgICAgIHByb2dyYW1MaXN0LmZvckVhY2goZnVuY3Rpb24gKGRlc2MpIHtcclxuICAgICAgICBpZiAoZGVzYy5zdGF0cy51bmlmb3Jtc0NvdW50ID4gbSkge1xyXG4gICAgICAgICAgbSA9IGRlc2Muc3RhdHMudW5pZm9ybXNDb3VudDtcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG4gICAgICByZXR1cm4gbVxyXG4gICAgfTtcclxuXHJcbiAgICBzdGF0cy5nZXRNYXhBdHRyaWJ1dGVzQ291bnQgPSBmdW5jdGlvbiAoKSB7XHJcbiAgICAgIHZhciBtID0gMDtcclxuICAgICAgcHJvZ3JhbUxpc3QuZm9yRWFjaChmdW5jdGlvbiAoZGVzYykge1xyXG4gICAgICAgIGlmIChkZXNjLnN0YXRzLmF0dHJpYnV0ZXNDb3VudCA+IG0pIHtcclxuICAgICAgICAgIG0gPSBkZXNjLnN0YXRzLmF0dHJpYnV0ZXNDb3VudDtcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG4gICAgICByZXR1cm4gbVxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHJlc3RvcmVTaGFkZXJzICgpIHtcclxuICAgIGZyYWdTaGFkZXJzID0ge307XHJcbiAgICB2ZXJ0U2hhZGVycyA9IHt9O1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwcm9ncmFtTGlzdC5sZW5ndGg7ICsraSkge1xyXG4gICAgICBsaW5rUHJvZ3JhbShwcm9ncmFtTGlzdFtpXSk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICByZXR1cm4ge1xyXG4gICAgY2xlYXI6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgdmFyIGRlbGV0ZVNoYWRlciA9IGdsLmRlbGV0ZVNoYWRlci5iaW5kKGdsKTtcclxuICAgICAgdmFsdWVzKGZyYWdTaGFkZXJzKS5mb3JFYWNoKGRlbGV0ZVNoYWRlcik7XHJcbiAgICAgIGZyYWdTaGFkZXJzID0ge307XHJcbiAgICAgIHZhbHVlcyh2ZXJ0U2hhZGVycykuZm9yRWFjaChkZWxldGVTaGFkZXIpO1xyXG4gICAgICB2ZXJ0U2hhZGVycyA9IHt9O1xyXG5cclxuICAgICAgcHJvZ3JhbUxpc3QuZm9yRWFjaChmdW5jdGlvbiAoZGVzYykge1xyXG4gICAgICAgIGdsLmRlbGV0ZVByb2dyYW0oZGVzYy5wcm9ncmFtKTtcclxuICAgICAgfSk7XHJcbiAgICAgIHByb2dyYW1MaXN0Lmxlbmd0aCA9IDA7XHJcbiAgICAgIHByb2dyYW1DYWNoZSA9IHt9O1xyXG5cclxuICAgICAgc3RhdHMuc2hhZGVyQ291bnQgPSAwO1xyXG4gICAgfSxcclxuXHJcbiAgICBwcm9ncmFtOiBmdW5jdGlvbiAodmVydElkLCBmcmFnSWQsIGNvbW1hbmQpIHtcclxuICAgICAgY2hlY2skMS5jb21tYW5kKHZlcnRJZCA+PSAwLCAnbWlzc2luZyB2ZXJ0ZXggc2hhZGVyJywgY29tbWFuZCk7XHJcbiAgICAgIGNoZWNrJDEuY29tbWFuZChmcmFnSWQgPj0gMCwgJ21pc3NpbmcgZnJhZ21lbnQgc2hhZGVyJywgY29tbWFuZCk7XHJcblxyXG4gICAgICB2YXIgY2FjaGUgPSBwcm9ncmFtQ2FjaGVbZnJhZ0lkXTtcclxuICAgICAgaWYgKCFjYWNoZSkge1xyXG4gICAgICAgIGNhY2hlID0gcHJvZ3JhbUNhY2hlW2ZyYWdJZF0gPSB7fTtcclxuICAgICAgfVxyXG4gICAgICB2YXIgcHJvZ3JhbSA9IGNhY2hlW3ZlcnRJZF07XHJcbiAgICAgIGlmICghcHJvZ3JhbSkge1xyXG4gICAgICAgIHByb2dyYW0gPSBuZXcgUkVHTFByb2dyYW0oZnJhZ0lkLCB2ZXJ0SWQpO1xyXG4gICAgICAgIHN0YXRzLnNoYWRlckNvdW50Kys7XHJcblxyXG4gICAgICAgIGxpbmtQcm9ncmFtKHByb2dyYW0sIGNvbW1hbmQpO1xyXG4gICAgICAgIGNhY2hlW3ZlcnRJZF0gPSBwcm9ncmFtO1xyXG4gICAgICAgIHByb2dyYW1MaXN0LnB1c2gocHJvZ3JhbSk7XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIHByb2dyYW1cclxuICAgIH0sXHJcblxyXG4gICAgcmVzdG9yZTogcmVzdG9yZVNoYWRlcnMsXHJcblxyXG4gICAgc2hhZGVyOiBnZXRTaGFkZXIsXHJcblxyXG4gICAgZnJhZzogLTEsXHJcbiAgICB2ZXJ0OiAtMVxyXG4gIH1cclxufVxuXG52YXIgR0xfUkdCQSQzID0gNjQwODtcclxudmFyIEdMX1VOU0lHTkVEX0JZVEUkNyA9IDUxMjE7XHJcbnZhciBHTF9QQUNLX0FMSUdOTUVOVCA9IDB4MEQwNTtcclxudmFyIEdMX0ZMT0FUJDcgPSAweDE0MDY7IC8vIDUxMjZcclxuXHJcbmZ1bmN0aW9uIHdyYXBSZWFkUGl4ZWxzIChcclxuICBnbCxcclxuICBmcmFtZWJ1ZmZlclN0YXRlLFxyXG4gIHJlZ2xQb2xsLFxyXG4gIGNvbnRleHQsXHJcbiAgZ2xBdHRyaWJ1dGVzLFxyXG4gIGV4dGVuc2lvbnMsXHJcbiAgbGltaXRzKSB7XHJcbiAgZnVuY3Rpb24gcmVhZFBpeGVsc0ltcGwgKGlucHV0KSB7XHJcbiAgICB2YXIgdHlwZTtcclxuICAgIGlmIChmcmFtZWJ1ZmZlclN0YXRlLm5leHQgPT09IG51bGwpIHtcclxuICAgICAgY2hlY2skMShcclxuICAgICAgICBnbEF0dHJpYnV0ZXMucHJlc2VydmVEcmF3aW5nQnVmZmVyLFxyXG4gICAgICAgICd5b3UgbXVzdCBjcmVhdGUgYSB3ZWJnbCBjb250ZXh0IHdpdGggXCJwcmVzZXJ2ZURyYXdpbmdCdWZmZXJcIjp0cnVlIGluIG9yZGVyIHRvIHJlYWQgcGl4ZWxzIGZyb20gdGhlIGRyYXdpbmcgYnVmZmVyJyk7XHJcbiAgICAgIHR5cGUgPSBHTF9VTlNJR05FRF9CWVRFJDc7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBjaGVjayQxKFxyXG4gICAgICAgIGZyYW1lYnVmZmVyU3RhdGUubmV4dC5jb2xvckF0dGFjaG1lbnRzWzBdLnRleHR1cmUgIT09IG51bGwsXHJcbiAgICAgICAgICAnWW91IGNhbm5vdCByZWFkIGZyb20gYSByZW5kZXJidWZmZXInKTtcclxuICAgICAgdHlwZSA9IGZyYW1lYnVmZmVyU3RhdGUubmV4dC5jb2xvckF0dGFjaG1lbnRzWzBdLnRleHR1cmUuX3RleHR1cmUudHlwZTtcclxuXHJcbiAgICAgIGlmIChleHRlbnNpb25zLm9lc190ZXh0dXJlX2Zsb2F0KSB7XHJcbiAgICAgICAgY2hlY2skMShcclxuICAgICAgICAgIHR5cGUgPT09IEdMX1VOU0lHTkVEX0JZVEUkNyB8fCB0eXBlID09PSBHTF9GTE9BVCQ3LFxyXG4gICAgICAgICAgJ1JlYWRpbmcgZnJvbSBhIGZyYW1lYnVmZmVyIGlzIG9ubHkgYWxsb3dlZCBmb3IgdGhlIHR5cGVzIFxcJ3VpbnQ4XFwnIGFuZCBcXCdmbG9hdFxcJycpO1xyXG5cclxuICAgICAgICBpZiAodHlwZSA9PT0gR0xfRkxPQVQkNykge1xyXG4gICAgICAgICAgY2hlY2skMShsaW1pdHMucmVhZEZsb2F0LCAnUmVhZGluZyBcXCdmbG9hdFxcJyB2YWx1ZXMgaXMgbm90IHBlcm1pdHRlZCBpbiB5b3VyIGJyb3dzZXIuIEZvciBhIGZhbGxiYWNrLCBwbGVhc2Ugc2VlOiBodHRwczovL3d3dy5ucG1qcy5jb20vcGFja2FnZS9nbHNsLXJlYWQtZmxvYXQnKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgY2hlY2skMShcclxuICAgICAgICAgIHR5cGUgPT09IEdMX1VOU0lHTkVEX0JZVEUkNyxcclxuICAgICAgICAgICdSZWFkaW5nIGZyb20gYSBmcmFtZWJ1ZmZlciBpcyBvbmx5IGFsbG93ZWQgZm9yIHRoZSB0eXBlIFxcJ3VpbnQ4XFwnJyk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB2YXIgeCA9IDA7XHJcbiAgICB2YXIgeSA9IDA7XHJcbiAgICB2YXIgd2lkdGggPSBjb250ZXh0LmZyYW1lYnVmZmVyV2lkdGg7XHJcbiAgICB2YXIgaGVpZ2h0ID0gY29udGV4dC5mcmFtZWJ1ZmZlckhlaWdodDtcclxuICAgIHZhciBkYXRhID0gbnVsbDtcclxuXHJcbiAgICBpZiAoaXNUeXBlZEFycmF5KGlucHV0KSkge1xyXG4gICAgICBkYXRhID0gaW5wdXQ7XHJcbiAgICB9IGVsc2UgaWYgKGlucHV0KSB7XHJcbiAgICAgIGNoZWNrJDEudHlwZShpbnB1dCwgJ29iamVjdCcsICdpbnZhbGlkIGFyZ3VtZW50cyB0byByZWdsLnJlYWQoKScpO1xyXG4gICAgICB4ID0gaW5wdXQueCB8IDA7XHJcbiAgICAgIHkgPSBpbnB1dC55IHwgMDtcclxuICAgICAgY2hlY2skMShcclxuICAgICAgICB4ID49IDAgJiYgeCA8IGNvbnRleHQuZnJhbWVidWZmZXJXaWR0aCxcclxuICAgICAgICAnaW52YWxpZCB4IG9mZnNldCBmb3IgcmVnbC5yZWFkJyk7XHJcbiAgICAgIGNoZWNrJDEoXHJcbiAgICAgICAgeSA+PSAwICYmIHkgPCBjb250ZXh0LmZyYW1lYnVmZmVySGVpZ2h0LFxyXG4gICAgICAgICdpbnZhbGlkIHkgb2Zmc2V0IGZvciByZWdsLnJlYWQnKTtcclxuICAgICAgd2lkdGggPSAoaW5wdXQud2lkdGggfHwgKGNvbnRleHQuZnJhbWVidWZmZXJXaWR0aCAtIHgpKSB8IDA7XHJcbiAgICAgIGhlaWdodCA9IChpbnB1dC5oZWlnaHQgfHwgKGNvbnRleHQuZnJhbWVidWZmZXJIZWlnaHQgLSB5KSkgfCAwO1xyXG4gICAgICBkYXRhID0gaW5wdXQuZGF0YSB8fCBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIHNhbml0eSBjaGVjayBpbnB1dC5kYXRhXHJcbiAgICBpZiAoZGF0YSkge1xyXG4gICAgICBpZiAodHlwZSA9PT0gR0xfVU5TSUdORURfQllURSQ3KSB7XHJcbiAgICAgICAgY2hlY2skMShcclxuICAgICAgICAgIGRhdGEgaW5zdGFuY2VvZiBVaW50OEFycmF5LFxyXG4gICAgICAgICAgJ2J1ZmZlciBtdXN0IGJlIFxcJ1VpbnQ4QXJyYXlcXCcgd2hlbiByZWFkaW5nIGZyb20gYSBmcmFtZWJ1ZmZlciBvZiB0eXBlIFxcJ3VpbnQ4XFwnJyk7XHJcbiAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gR0xfRkxPQVQkNykge1xyXG4gICAgICAgIGNoZWNrJDEoXHJcbiAgICAgICAgICBkYXRhIGluc3RhbmNlb2YgRmxvYXQzMkFycmF5LFxyXG4gICAgICAgICAgJ2J1ZmZlciBtdXN0IGJlIFxcJ0Zsb2F0MzJBcnJheVxcJyB3aGVuIHJlYWRpbmcgZnJvbSBhIGZyYW1lYnVmZmVyIG9mIHR5cGUgXFwnZmxvYXRcXCcnKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGNoZWNrJDEoXHJcbiAgICAgIHdpZHRoID4gMCAmJiB3aWR0aCArIHggPD0gY29udGV4dC5mcmFtZWJ1ZmZlcldpZHRoLFxyXG4gICAgICAnaW52YWxpZCB3aWR0aCBmb3IgcmVhZCBwaXhlbHMnKTtcclxuICAgIGNoZWNrJDEoXHJcbiAgICAgIGhlaWdodCA+IDAgJiYgaGVpZ2h0ICsgeSA8PSBjb250ZXh0LmZyYW1lYnVmZmVySGVpZ2h0LFxyXG4gICAgICAnaW52YWxpZCBoZWlnaHQgZm9yIHJlYWQgcGl4ZWxzJyk7XHJcblxyXG4gICAgLy8gVXBkYXRlIFdlYkdMIHN0YXRlXHJcbiAgICByZWdsUG9sbCgpO1xyXG5cclxuICAgIC8vIENvbXB1dGUgc2l6ZVxyXG4gICAgdmFyIHNpemUgPSB3aWR0aCAqIGhlaWdodCAqIDQ7XHJcblxyXG4gICAgLy8gQWxsb2NhdGUgZGF0YVxyXG4gICAgaWYgKCFkYXRhKSB7XHJcbiAgICAgIGlmICh0eXBlID09PSBHTF9VTlNJR05FRF9CWVRFJDcpIHtcclxuICAgICAgICBkYXRhID0gbmV3IFVpbnQ4QXJyYXkoc2l6ZSk7XHJcbiAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gR0xfRkxPQVQkNykge1xyXG4gICAgICAgIGRhdGEgPSBkYXRhIHx8IG5ldyBGbG9hdDMyQXJyYXkoc2l6ZSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBUeXBlIGNoZWNrXHJcbiAgICBjaGVjayQxLmlzVHlwZWRBcnJheShkYXRhLCAnZGF0YSBidWZmZXIgZm9yIHJlZ2wucmVhZCgpIG11c3QgYmUgYSB0eXBlZGFycmF5Jyk7XHJcbiAgICBjaGVjayQxKGRhdGEuYnl0ZUxlbmd0aCA+PSBzaXplLCAnZGF0YSBidWZmZXIgZm9yIHJlZ2wucmVhZCgpIHRvbyBzbWFsbCcpO1xyXG5cclxuICAgIC8vIFJ1biByZWFkIHBpeGVsc1xyXG4gICAgZ2wucGl4ZWxTdG9yZWkoR0xfUEFDS19BTElHTk1FTlQsIDQpO1xyXG4gICAgZ2wucmVhZFBpeGVscyh4LCB5LCB3aWR0aCwgaGVpZ2h0LCBHTF9SR0JBJDMsXHJcbiAgICAgICAgICAgICAgICAgIHR5cGUsXHJcbiAgICAgICAgICAgICAgICAgIGRhdGEpO1xyXG5cclxuICAgIHJldHVybiBkYXRhXHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiByZWFkUGl4ZWxzRkJPIChvcHRpb25zKSB7XHJcbiAgICB2YXIgcmVzdWx0O1xyXG4gICAgZnJhbWVidWZmZXJTdGF0ZS5zZXRGQk8oe1xyXG4gICAgICBmcmFtZWJ1ZmZlcjogb3B0aW9ucy5mcmFtZWJ1ZmZlclxyXG4gICAgfSwgZnVuY3Rpb24gKCkge1xyXG4gICAgICByZXN1bHQgPSByZWFkUGl4ZWxzSW1wbChvcHRpb25zKTtcclxuICAgIH0pO1xyXG4gICAgcmV0dXJuIHJlc3VsdFxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gcmVhZFBpeGVscyAob3B0aW9ucykge1xyXG4gICAgaWYgKCFvcHRpb25zIHx8ICEoJ2ZyYW1lYnVmZmVyJyBpbiBvcHRpb25zKSkge1xyXG4gICAgICByZXR1cm4gcmVhZFBpeGVsc0ltcGwob3B0aW9ucylcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHJldHVybiByZWFkUGl4ZWxzRkJPKG9wdGlvbnMpXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICByZXR1cm4gcmVhZFBpeGVsc1xyXG59XG5cbmZ1bmN0aW9uIHNsaWNlICh4KSB7XHJcbiAgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHgpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGpvaW4gKHgpIHtcclxuICByZXR1cm4gc2xpY2UoeCkuam9pbignJylcclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlRW52aXJvbm1lbnQgKCkge1xyXG4gIC8vIFVuaXF1ZSB2YXJpYWJsZSBpZCBjb3VudGVyXHJcbiAgdmFyIHZhckNvdW50ZXIgPSAwO1xyXG5cclxuICAvLyBMaW5rZWQgdmFsdWVzIGFyZSBwYXNzZWQgZnJvbSB0aGlzIHNjb3BlIGludG8gdGhlIGdlbmVyYXRlZCBjb2RlIGJsb2NrXHJcbiAgLy8gQ2FsbGluZyBsaW5rKCkgcGFzc2VzIGEgdmFsdWUgaW50byB0aGUgZ2VuZXJhdGVkIHNjb3BlIGFuZCByZXR1cm5zXHJcbiAgLy8gdGhlIHZhcmlhYmxlIG5hbWUgd2hpY2ggaXQgaXMgYm91bmQgdG9cclxuICB2YXIgbGlua2VkTmFtZXMgPSBbXTtcclxuICB2YXIgbGlua2VkVmFsdWVzID0gW107XHJcbiAgZnVuY3Rpb24gbGluayAodmFsdWUpIHtcclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGlua2VkVmFsdWVzLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgIGlmIChsaW5rZWRWYWx1ZXNbaV0gPT09IHZhbHVlKSB7XHJcbiAgICAgICAgcmV0dXJuIGxpbmtlZE5hbWVzW2ldXHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB2YXIgbmFtZSA9ICdnJyArICh2YXJDb3VudGVyKyspO1xyXG4gICAgbGlua2VkTmFtZXMucHVzaChuYW1lKTtcclxuICAgIGxpbmtlZFZhbHVlcy5wdXNoKHZhbHVlKTtcclxuICAgIHJldHVybiBuYW1lXHJcbiAgfVxyXG5cclxuICAvLyBjcmVhdGUgYSBjb2RlIGJsb2NrXHJcbiAgZnVuY3Rpb24gYmxvY2sgKCkge1xyXG4gICAgdmFyIGNvZGUgPSBbXTtcclxuICAgIGZ1bmN0aW9uIHB1c2ggKCkge1xyXG4gICAgICBjb2RlLnB1c2guYXBwbHkoY29kZSwgc2xpY2UoYXJndW1lbnRzKSk7XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIHZhcnMgPSBbXTtcclxuICAgIGZ1bmN0aW9uIGRlZiAoKSB7XHJcbiAgICAgIHZhciBuYW1lID0gJ3YnICsgKHZhckNvdW50ZXIrKyk7XHJcbiAgICAgIHZhcnMucHVzaChuYW1lKTtcclxuXHJcbiAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIGNvZGUucHVzaChuYW1lLCAnPScpO1xyXG4gICAgICAgIGNvZGUucHVzaC5hcHBseShjb2RlLCBzbGljZShhcmd1bWVudHMpKTtcclxuICAgICAgICBjb2RlLnB1c2goJzsnKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuIG5hbWVcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gZXh0ZW5kKHB1c2gsIHtcclxuICAgICAgZGVmOiBkZWYsXHJcbiAgICAgIHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgcmV0dXJuIGpvaW4oW1xyXG4gICAgICAgICAgKHZhcnMubGVuZ3RoID4gMCA/ICd2YXIgJyArIHZhcnMgKyAnOycgOiAnJyksXHJcbiAgICAgICAgICBqb2luKGNvZGUpXHJcbiAgICAgICAgXSlcclxuICAgICAgfVxyXG4gICAgfSlcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHNjb3BlICgpIHtcclxuICAgIHZhciBlbnRyeSA9IGJsb2NrKCk7XHJcbiAgICB2YXIgZXhpdCA9IGJsb2NrKCk7XHJcblxyXG4gICAgdmFyIGVudHJ5VG9TdHJpbmcgPSBlbnRyeS50b1N0cmluZztcclxuICAgIHZhciBleGl0VG9TdHJpbmcgPSBleGl0LnRvU3RyaW5nO1xyXG5cclxuICAgIGZ1bmN0aW9uIHNhdmUgKG9iamVjdCwgcHJvcCkge1xyXG4gICAgICBleGl0KG9iamVjdCwgcHJvcCwgJz0nLCBlbnRyeS5kZWYob2JqZWN0LCBwcm9wKSwgJzsnKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gZXh0ZW5kKGZ1bmN0aW9uICgpIHtcclxuICAgICAgZW50cnkuYXBwbHkoZW50cnksIHNsaWNlKGFyZ3VtZW50cykpO1xyXG4gICAgfSwge1xyXG4gICAgICBkZWY6IGVudHJ5LmRlZixcclxuICAgICAgZW50cnk6IGVudHJ5LFxyXG4gICAgICBleGl0OiBleGl0LFxyXG4gICAgICBzYXZlOiBzYXZlLFxyXG4gICAgICBzZXQ6IGZ1bmN0aW9uIChvYmplY3QsIHByb3AsIHZhbHVlKSB7XHJcbiAgICAgICAgc2F2ZShvYmplY3QsIHByb3ApO1xyXG4gICAgICAgIGVudHJ5KG9iamVjdCwgcHJvcCwgJz0nLCB2YWx1ZSwgJzsnKTtcclxuICAgICAgfSxcclxuICAgICAgdG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICByZXR1cm4gZW50cnlUb1N0cmluZygpICsgZXhpdFRvU3RyaW5nKClcclxuICAgICAgfVxyXG4gICAgfSlcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGNvbmRpdGlvbmFsICgpIHtcclxuICAgIHZhciBwcmVkID0gam9pbihhcmd1bWVudHMpO1xyXG4gICAgdmFyIHRoZW5CbG9jayA9IHNjb3BlKCk7XHJcbiAgICB2YXIgZWxzZUJsb2NrID0gc2NvcGUoKTtcclxuXHJcbiAgICB2YXIgdGhlblRvU3RyaW5nID0gdGhlbkJsb2NrLnRvU3RyaW5nO1xyXG4gICAgdmFyIGVsc2VUb1N0cmluZyA9IGVsc2VCbG9jay50b1N0cmluZztcclxuXHJcbiAgICByZXR1cm4gZXh0ZW5kKHRoZW5CbG9jaywge1xyXG4gICAgICB0aGVuOiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgdGhlbkJsb2NrLmFwcGx5KHRoZW5CbG9jaywgc2xpY2UoYXJndW1lbnRzKSk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXNcclxuICAgICAgfSxcclxuICAgICAgZWxzZTogZnVuY3Rpb24gKCkge1xyXG4gICAgICAgIGVsc2VCbG9jay5hcHBseShlbHNlQmxvY2ssIHNsaWNlKGFyZ3VtZW50cykpO1xyXG4gICAgICAgIHJldHVybiB0aGlzXHJcbiAgICAgIH0sXHJcbiAgICAgIHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgdmFyIGVsc2VDbGF1c2UgPSBlbHNlVG9TdHJpbmcoKTtcclxuICAgICAgICBpZiAoZWxzZUNsYXVzZSkge1xyXG4gICAgICAgICAgZWxzZUNsYXVzZSA9ICdlbHNleycgKyBlbHNlQ2xhdXNlICsgJ30nO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gam9pbihbXHJcbiAgICAgICAgICAnaWYoJywgcHJlZCwgJyl7JyxcclxuICAgICAgICAgIHRoZW5Ub1N0cmluZygpLFxyXG4gICAgICAgICAgJ30nLCBlbHNlQ2xhdXNlXHJcbiAgICAgICAgXSlcclxuICAgICAgfVxyXG4gICAgfSlcclxuICB9XHJcblxyXG4gIC8vIHByb2NlZHVyZSBsaXN0XHJcbiAgdmFyIGdsb2JhbEJsb2NrID0gYmxvY2soKTtcclxuICB2YXIgcHJvY2VkdXJlcyA9IHt9O1xyXG4gIGZ1bmN0aW9uIHByb2MgKG5hbWUsIGNvdW50KSB7XHJcbiAgICB2YXIgYXJncyA9IFtdO1xyXG4gICAgZnVuY3Rpb24gYXJnICgpIHtcclxuICAgICAgdmFyIG5hbWUgPSAnYScgKyBhcmdzLmxlbmd0aDtcclxuICAgICAgYXJncy5wdXNoKG5hbWUpO1xyXG4gICAgICByZXR1cm4gbmFtZVxyXG4gICAgfVxyXG5cclxuICAgIGNvdW50ID0gY291bnQgfHwgMDtcclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY291bnQ7ICsraSkge1xyXG4gICAgICBhcmcoKTtcclxuICAgIH1cclxuXHJcbiAgICB2YXIgYm9keSA9IHNjb3BlKCk7XHJcbiAgICB2YXIgYm9keVRvU3RyaW5nID0gYm9keS50b1N0cmluZztcclxuXHJcbiAgICB2YXIgcmVzdWx0ID0gcHJvY2VkdXJlc1tuYW1lXSA9IGV4dGVuZChib2R5LCB7XHJcbiAgICAgIGFyZzogYXJnLFxyXG4gICAgICB0b1N0cmluZzogZnVuY3Rpb24gKCkge1xyXG4gICAgICAgIHJldHVybiBqb2luKFtcclxuICAgICAgICAgICdmdW5jdGlvbignLCBhcmdzLmpvaW4oKSwgJyl7JyxcclxuICAgICAgICAgIGJvZHlUb1N0cmluZygpLFxyXG4gICAgICAgICAgJ30nXHJcbiAgICAgICAgXSlcclxuICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIHJlc3VsdFxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gY29tcGlsZSAoKSB7XHJcbiAgICB2YXIgY29kZSA9IFsnXCJ1c2Ugc3RyaWN0XCI7JyxcclxuICAgICAgZ2xvYmFsQmxvY2ssXHJcbiAgICAgICdyZXR1cm4geyddO1xyXG4gICAgT2JqZWN0LmtleXMocHJvY2VkdXJlcykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xyXG4gICAgICBjb2RlLnB1c2goJ1wiJywgbmFtZSwgJ1wiOicsIHByb2NlZHVyZXNbbmFtZV0udG9TdHJpbmcoKSwgJywnKTtcclxuICAgIH0pO1xyXG4gICAgY29kZS5wdXNoKCd9Jyk7XHJcbiAgICB2YXIgc3JjID0gam9pbihjb2RlKVxyXG4gICAgICAucmVwbGFjZSgvOy9nLCAnO1xcbicpXHJcbiAgICAgIC5yZXBsYWNlKC99L2csICd9XFxuJylcclxuICAgICAgLnJlcGxhY2UoL3svZywgJ3tcXG4nKTtcclxuICAgIHZhciBwcm9jID0gRnVuY3Rpb24uYXBwbHkobnVsbCwgbGlua2VkTmFtZXMuY29uY2F0KHNyYykpO1xyXG4gICAgcmV0dXJuIHByb2MuYXBwbHkobnVsbCwgbGlua2VkVmFsdWVzKVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIGdsb2JhbDogZ2xvYmFsQmxvY2ssXHJcbiAgICBsaW5rOiBsaW5rLFxyXG4gICAgYmxvY2s6IGJsb2NrLFxyXG4gICAgcHJvYzogcHJvYyxcclxuICAgIHNjb3BlOiBzY29wZSxcclxuICAgIGNvbmQ6IGNvbmRpdGlvbmFsLFxyXG4gICAgY29tcGlsZTogY29tcGlsZVxyXG4gIH1cclxufVxuXG4vLyBcImN1dGVcIiBuYW1lcyBmb3IgdmVjdG9yIGNvbXBvbmVudHNcclxudmFyIENVVEVfQ09NUE9ORU5UUyA9ICd4eXp3Jy5zcGxpdCgnJyk7XHJcblxyXG52YXIgR0xfVU5TSUdORURfQllURSQ4ID0gNTEyMTtcclxuXHJcbnZhciBBVFRSSUJfU1RBVEVfUE9JTlRFUiA9IDE7XHJcbnZhciBBVFRSSUJfU1RBVEVfQ09OU1RBTlQgPSAyO1xyXG5cclxudmFyIERZTl9GVU5DJDEgPSAwO1xyXG52YXIgRFlOX1BST1AkMSA9IDE7XHJcbnZhciBEWU5fQ09OVEVYVCQxID0gMjtcclxudmFyIERZTl9TVEFURSQxID0gMztcclxudmFyIERZTl9USFVOSyA9IDQ7XHJcblxyXG52YXIgU19ESVRIRVIgPSAnZGl0aGVyJztcclxudmFyIFNfQkxFTkRfRU5BQkxFID0gJ2JsZW5kLmVuYWJsZSc7XHJcbnZhciBTX0JMRU5EX0NPTE9SID0gJ2JsZW5kLmNvbG9yJztcclxudmFyIFNfQkxFTkRfRVFVQVRJT04gPSAnYmxlbmQuZXF1YXRpb24nO1xyXG52YXIgU19CTEVORF9GVU5DID0gJ2JsZW5kLmZ1bmMnO1xyXG52YXIgU19ERVBUSF9FTkFCTEUgPSAnZGVwdGguZW5hYmxlJztcclxudmFyIFNfREVQVEhfRlVOQyA9ICdkZXB0aC5mdW5jJztcclxudmFyIFNfREVQVEhfUkFOR0UgPSAnZGVwdGgucmFuZ2UnO1xyXG52YXIgU19ERVBUSF9NQVNLID0gJ2RlcHRoLm1hc2snO1xyXG52YXIgU19DT0xPUl9NQVNLID0gJ2NvbG9yTWFzayc7XHJcbnZhciBTX0NVTExfRU5BQkxFID0gJ2N1bGwuZW5hYmxlJztcclxudmFyIFNfQ1VMTF9GQUNFID0gJ2N1bGwuZmFjZSc7XHJcbnZhciBTX0ZST05UX0ZBQ0UgPSAnZnJvbnRGYWNlJztcclxudmFyIFNfTElORV9XSURUSCA9ICdsaW5lV2lkdGgnO1xyXG52YXIgU19QT0xZR09OX09GRlNFVF9FTkFCTEUgPSAncG9seWdvbk9mZnNldC5lbmFibGUnO1xyXG52YXIgU19QT0xZR09OX09GRlNFVF9PRkZTRVQgPSAncG9seWdvbk9mZnNldC5vZmZzZXQnO1xyXG52YXIgU19TQU1QTEVfQUxQSEEgPSAnc2FtcGxlLmFscGhhJztcclxudmFyIFNfU0FNUExFX0VOQUJMRSA9ICdzYW1wbGUuZW5hYmxlJztcclxudmFyIFNfU0FNUExFX0NPVkVSQUdFID0gJ3NhbXBsZS5jb3ZlcmFnZSc7XHJcbnZhciBTX1NURU5DSUxfRU5BQkxFID0gJ3N0ZW5jaWwuZW5hYmxlJztcclxudmFyIFNfU1RFTkNJTF9NQVNLID0gJ3N0ZW5jaWwubWFzayc7XHJcbnZhciBTX1NURU5DSUxfRlVOQyA9ICdzdGVuY2lsLmZ1bmMnO1xyXG52YXIgU19TVEVOQ0lMX09QRlJPTlQgPSAnc3RlbmNpbC5vcEZyb250JztcclxudmFyIFNfU1RFTkNJTF9PUEJBQ0sgPSAnc3RlbmNpbC5vcEJhY2snO1xyXG52YXIgU19TQ0lTU09SX0VOQUJMRSA9ICdzY2lzc29yLmVuYWJsZSc7XHJcbnZhciBTX1NDSVNTT1JfQk9YID0gJ3NjaXNzb3IuYm94JztcclxudmFyIFNfVklFV1BPUlQgPSAndmlld3BvcnQnO1xyXG5cclxudmFyIFNfUFJPRklMRSA9ICdwcm9maWxlJztcclxuXHJcbnZhciBTX0ZSQU1FQlVGRkVSID0gJ2ZyYW1lYnVmZmVyJztcclxudmFyIFNfVkVSVCA9ICd2ZXJ0JztcclxudmFyIFNfRlJBRyA9ICdmcmFnJztcclxudmFyIFNfRUxFTUVOVFMgPSAnZWxlbWVudHMnO1xyXG52YXIgU19QUklNSVRJVkUgPSAncHJpbWl0aXZlJztcclxudmFyIFNfQ09VTlQgPSAnY291bnQnO1xyXG52YXIgU19PRkZTRVQgPSAnb2Zmc2V0JztcclxudmFyIFNfSU5TVEFOQ0VTID0gJ2luc3RhbmNlcyc7XHJcblxyXG52YXIgU1VGRklYX1dJRFRIID0gJ1dpZHRoJztcclxudmFyIFNVRkZJWF9IRUlHSFQgPSAnSGVpZ2h0JztcclxuXHJcbnZhciBTX0ZSQU1FQlVGRkVSX1dJRFRIID0gU19GUkFNRUJVRkZFUiArIFNVRkZJWF9XSURUSDtcclxudmFyIFNfRlJBTUVCVUZGRVJfSEVJR0hUID0gU19GUkFNRUJVRkZFUiArIFNVRkZJWF9IRUlHSFQ7XHJcbnZhciBTX1ZJRVdQT1JUX1dJRFRIID0gU19WSUVXUE9SVCArIFNVRkZJWF9XSURUSDtcclxudmFyIFNfVklFV1BPUlRfSEVJR0hUID0gU19WSUVXUE9SVCArIFNVRkZJWF9IRUlHSFQ7XHJcbnZhciBTX0RSQVdJTkdCVUZGRVIgPSAnZHJhd2luZ0J1ZmZlcic7XHJcbnZhciBTX0RSQVdJTkdCVUZGRVJfV0lEVEggPSBTX0RSQVdJTkdCVUZGRVIgKyBTVUZGSVhfV0lEVEg7XHJcbnZhciBTX0RSQVdJTkdCVUZGRVJfSEVJR0hUID0gU19EUkFXSU5HQlVGRkVSICsgU1VGRklYX0hFSUdIVDtcclxuXHJcbnZhciBORVNURURfT1BUSU9OUyA9IFtcclxuICBTX0JMRU5EX0ZVTkMsXHJcbiAgU19CTEVORF9FUVVBVElPTixcclxuICBTX1NURU5DSUxfRlVOQyxcclxuICBTX1NURU5DSUxfT1BGUk9OVCxcclxuICBTX1NURU5DSUxfT1BCQUNLLFxyXG4gIFNfU0FNUExFX0NPVkVSQUdFLFxyXG4gIFNfVklFV1BPUlQsXHJcbiAgU19TQ0lTU09SX0JPWCxcclxuICBTX1BPTFlHT05fT0ZGU0VUX09GRlNFVFxyXG5dO1xyXG5cclxudmFyIEdMX0FSUkFZX0JVRkZFUiQxID0gMzQ5NjI7XHJcbnZhciBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiQxID0gMzQ5NjM7XHJcblxyXG52YXIgR0xfRlJBR01FTlRfU0hBREVSJDEgPSAzNTYzMjtcclxudmFyIEdMX1ZFUlRFWF9TSEFERVIkMSA9IDM1NjMzO1xyXG5cclxudmFyIEdMX1RFWFRVUkVfMkQkMyA9IDB4MERFMTtcclxudmFyIEdMX1RFWFRVUkVfQ1VCRV9NQVAkMiA9IDB4ODUxMztcclxuXHJcbnZhciBHTF9DVUxMX0ZBQ0UgPSAweDBCNDQ7XHJcbnZhciBHTF9CTEVORCA9IDB4MEJFMjtcclxudmFyIEdMX0RJVEhFUiA9IDB4MEJEMDtcclxudmFyIEdMX1NURU5DSUxfVEVTVCA9IDB4MEI5MDtcclxudmFyIEdMX0RFUFRIX1RFU1QgPSAweDBCNzE7XHJcbnZhciBHTF9TQ0lTU09SX1RFU1QgPSAweDBDMTE7XHJcbnZhciBHTF9QT0xZR09OX09GRlNFVF9GSUxMID0gMHg4MDM3O1xyXG52YXIgR0xfU0FNUExFX0FMUEhBX1RPX0NPVkVSQUdFID0gMHg4MDlFO1xyXG52YXIgR0xfU0FNUExFX0NPVkVSQUdFID0gMHg4MEEwO1xyXG5cclxudmFyIEdMX0ZMT0FUJDggPSA1MTI2O1xyXG52YXIgR0xfRkxPQVRfVkVDMiA9IDM1NjY0O1xyXG52YXIgR0xfRkxPQVRfVkVDMyA9IDM1NjY1O1xyXG52YXIgR0xfRkxPQVRfVkVDNCA9IDM1NjY2O1xyXG52YXIgR0xfSU5UJDMgPSA1MTI0O1xyXG52YXIgR0xfSU5UX1ZFQzIgPSAzNTY2NztcclxudmFyIEdMX0lOVF9WRUMzID0gMzU2Njg7XHJcbnZhciBHTF9JTlRfVkVDNCA9IDM1NjY5O1xyXG52YXIgR0xfQk9PTCA9IDM1NjcwO1xyXG52YXIgR0xfQk9PTF9WRUMyID0gMzU2NzE7XHJcbnZhciBHTF9CT09MX1ZFQzMgPSAzNTY3MjtcclxudmFyIEdMX0JPT0xfVkVDNCA9IDM1NjczO1xyXG52YXIgR0xfRkxPQVRfTUFUMiA9IDM1Njc0O1xyXG52YXIgR0xfRkxPQVRfTUFUMyA9IDM1Njc1O1xyXG52YXIgR0xfRkxPQVRfTUFUNCA9IDM1Njc2O1xyXG52YXIgR0xfU0FNUExFUl8yRCA9IDM1Njc4O1xyXG52YXIgR0xfU0FNUExFUl9DVUJFID0gMzU2ODA7XHJcblxyXG52YXIgR0xfVFJJQU5HTEVTJDEgPSA0O1xyXG5cclxudmFyIEdMX0ZST05UID0gMTAyODtcclxudmFyIEdMX0JBQ0sgPSAxMDI5O1xyXG52YXIgR0xfQ1cgPSAweDA5MDA7XHJcbnZhciBHTF9DQ1cgPSAweDA5MDE7XHJcbnZhciBHTF9NSU5fRVhUID0gMHg4MDA3O1xyXG52YXIgR0xfTUFYX0VYVCA9IDB4ODAwODtcclxudmFyIEdMX0FMV0FZUyA9IDUxOTtcclxudmFyIEdMX0tFRVAgPSA3NjgwO1xyXG52YXIgR0xfWkVSTyA9IDA7XHJcbnZhciBHTF9PTkUgPSAxO1xyXG52YXIgR0xfRlVOQ19BREQgPSAweDgwMDY7XHJcbnZhciBHTF9MRVNTID0gNTEzO1xyXG5cclxudmFyIEdMX0ZSQU1FQlVGRkVSJDIgPSAweDhENDA7XHJcbnZhciBHTF9DT0xPUl9BVFRBQ0hNRU5UMCQyID0gMHg4Q0UwO1xyXG5cclxudmFyIGJsZW5kRnVuY3MgPSB7XHJcbiAgJzAnOiAwLFxyXG4gICcxJzogMSxcclxuICAnemVybyc6IDAsXHJcbiAgJ29uZSc6IDEsXHJcbiAgJ3NyYyBjb2xvcic6IDc2OCxcclxuICAnb25lIG1pbnVzIHNyYyBjb2xvcic6IDc2OSxcclxuICAnc3JjIGFscGhhJzogNzcwLFxyXG4gICdvbmUgbWludXMgc3JjIGFscGhhJzogNzcxLFxyXG4gICdkc3QgY29sb3InOiA3NzQsXHJcbiAgJ29uZSBtaW51cyBkc3QgY29sb3InOiA3NzUsXHJcbiAgJ2RzdCBhbHBoYSc6IDc3MixcclxuICAnb25lIG1pbnVzIGRzdCBhbHBoYSc6IDc3MyxcclxuICAnY29uc3RhbnQgY29sb3InOiAzMjc2OSxcclxuICAnb25lIG1pbnVzIGNvbnN0YW50IGNvbG9yJzogMzI3NzAsXHJcbiAgJ2NvbnN0YW50IGFscGhhJzogMzI3NzEsXHJcbiAgJ29uZSBtaW51cyBjb25zdGFudCBhbHBoYSc6IDMyNzcyLFxyXG4gICdzcmMgYWxwaGEgc2F0dXJhdGUnOiA3NzZcclxufTtcclxuXHJcbi8vIFRoZXJlIGFyZSBpbnZhbGlkIHZhbHVlcyBmb3Igc3JjUkdCIGFuZCBkc3RSR0IuIFNlZTpcclxuLy8gaHR0cHM6Ly93d3cua2hyb25vcy5vcmcvcmVnaXN0cnkvd2ViZ2wvc3BlY3MvMS4wLyM2LjEzXHJcbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS9LaHJvbm9zR3JvdXAvV2ViR0wvYmxvYi8wZDMyMDFmNWY3ZWMzYzAwNjBiYzFmMDQwNzc0NjE1NDFmMTk4N2I5L2NvbmZvcm1hbmNlLXN1aXRlcy8xLjAuMy9jb25mb3JtYW5jZS9taXNjL3dlYmdsLXNwZWNpZmljLmh0bWwjTDU2XHJcbnZhciBpbnZhbGlkQmxlbmRDb21iaW5hdGlvbnMgPSBbXHJcbiAgJ2NvbnN0YW50IGNvbG9yLCBjb25zdGFudCBhbHBoYScsXHJcbiAgJ29uZSBtaW51cyBjb25zdGFudCBjb2xvciwgY29uc3RhbnQgYWxwaGEnLFxyXG4gICdjb25zdGFudCBjb2xvciwgb25lIG1pbnVzIGNvbnN0YW50IGFscGhhJyxcclxuICAnb25lIG1pbnVzIGNvbnN0YW50IGNvbG9yLCBvbmUgbWludXMgY29uc3RhbnQgYWxwaGEnLFxyXG4gICdjb25zdGFudCBhbHBoYSwgY29uc3RhbnQgY29sb3InLFxyXG4gICdjb25zdGFudCBhbHBoYSwgb25lIG1pbnVzIGNvbnN0YW50IGNvbG9yJyxcclxuICAnb25lIG1pbnVzIGNvbnN0YW50IGFscGhhLCBjb25zdGFudCBjb2xvcicsXHJcbiAgJ29uZSBtaW51cyBjb25zdGFudCBhbHBoYSwgb25lIG1pbnVzIGNvbnN0YW50IGNvbG9yJ1xyXG5dO1xyXG5cclxudmFyIGNvbXBhcmVGdW5jcyA9IHtcclxuICAnbmV2ZXInOiA1MTIsXHJcbiAgJ2xlc3MnOiA1MTMsXHJcbiAgJzwnOiA1MTMsXHJcbiAgJ2VxdWFsJzogNTE0LFxyXG4gICc9JzogNTE0LFxyXG4gICc9PSc6IDUxNCxcclxuICAnPT09JzogNTE0LFxyXG4gICdsZXF1YWwnOiA1MTUsXHJcbiAgJzw9JzogNTE1LFxyXG4gICdncmVhdGVyJzogNTE2LFxyXG4gICc+JzogNTE2LFxyXG4gICdub3RlcXVhbCc6IDUxNyxcclxuICAnIT0nOiA1MTcsXHJcbiAgJyE9PSc6IDUxNyxcclxuICAnZ2VxdWFsJzogNTE4LFxyXG4gICc+PSc6IDUxOCxcclxuICAnYWx3YXlzJzogNTE5XHJcbn07XHJcblxyXG52YXIgc3RlbmNpbE9wcyA9IHtcclxuICAnMCc6IDAsXHJcbiAgJ3plcm8nOiAwLFxyXG4gICdrZWVwJzogNzY4MCxcclxuICAncmVwbGFjZSc6IDc2ODEsXHJcbiAgJ2luY3JlbWVudCc6IDc2ODIsXHJcbiAgJ2RlY3JlbWVudCc6IDc2ODMsXHJcbiAgJ2luY3JlbWVudCB3cmFwJzogMzQwNTUsXHJcbiAgJ2RlY3JlbWVudCB3cmFwJzogMzQwNTYsXHJcbiAgJ2ludmVydCc6IDUzODZcclxufTtcclxuXHJcbnZhciBzaGFkZXJUeXBlID0ge1xyXG4gICdmcmFnJzogR0xfRlJBR01FTlRfU0hBREVSJDEsXHJcbiAgJ3ZlcnQnOiBHTF9WRVJURVhfU0hBREVSJDFcclxufTtcclxuXHJcbnZhciBvcmllbnRhdGlvblR5cGUgPSB7XHJcbiAgJ2N3JzogR0xfQ1csXHJcbiAgJ2Njdyc6IEdMX0NDV1xyXG59O1xyXG5cclxuZnVuY3Rpb24gaXNCdWZmZXJBcmdzICh4KSB7XHJcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkoeCkgfHxcclxuICAgIGlzVHlwZWRBcnJheSh4KSB8fFxyXG4gICAgaXNOREFycmF5TGlrZSh4KVxyXG59XHJcblxyXG4vLyBNYWtlIHN1cmUgdmlld3BvcnQgaXMgcHJvY2Vzc2VkIGZpcnN0XHJcbmZ1bmN0aW9uIHNvcnRTdGF0ZSAoc3RhdGUpIHtcclxuICByZXR1cm4gc3RhdGUuc29ydChmdW5jdGlvbiAoYSwgYikge1xyXG4gICAgaWYgKGEgPT09IFNfVklFV1BPUlQpIHtcclxuICAgICAgcmV0dXJuIC0xXHJcbiAgICB9IGVsc2UgaWYgKGIgPT09IFNfVklFV1BPUlQpIHtcclxuICAgICAgcmV0dXJuIDFcclxuICAgIH1cclxuICAgIHJldHVybiAoYSA8IGIpID8gLTEgOiAxXHJcbiAgfSlcclxufVxyXG5cclxuZnVuY3Rpb24gRGVjbGFyYXRpb24gKHRoaXNEZXAsIGNvbnRleHREZXAsIHByb3BEZXAsIGFwcGVuZCkge1xyXG4gIHRoaXMudGhpc0RlcCA9IHRoaXNEZXA7XHJcbiAgdGhpcy5jb250ZXh0RGVwID0gY29udGV4dERlcDtcclxuICB0aGlzLnByb3BEZXAgPSBwcm9wRGVwO1xyXG4gIHRoaXMuYXBwZW5kID0gYXBwZW5kO1xyXG59XHJcblxyXG5mdW5jdGlvbiBpc1N0YXRpYyAoZGVjbCkge1xyXG4gIHJldHVybiBkZWNsICYmICEoZGVjbC50aGlzRGVwIHx8IGRlY2wuY29udGV4dERlcCB8fCBkZWNsLnByb3BEZXApXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZVN0YXRpY0RlY2wgKGFwcGVuZCkge1xyXG4gIHJldHVybiBuZXcgRGVjbGFyYXRpb24oZmFsc2UsIGZhbHNlLCBmYWxzZSwgYXBwZW5kKVxyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVEeW5hbWljRGVjbCAoZHluLCBhcHBlbmQpIHtcclxuICB2YXIgdHlwZSA9IGR5bi50eXBlO1xyXG4gIGlmICh0eXBlID09PSBEWU5fRlVOQyQxKSB7XHJcbiAgICB2YXIgbnVtQXJncyA9IGR5bi5kYXRhLmxlbmd0aDtcclxuICAgIHJldHVybiBuZXcgRGVjbGFyYXRpb24oXHJcbiAgICAgIHRydWUsXHJcbiAgICAgIG51bUFyZ3MgPj0gMSxcclxuICAgICAgbnVtQXJncyA+PSAyLFxyXG4gICAgICBhcHBlbmQpXHJcbiAgfSBlbHNlIGlmICh0eXBlID09PSBEWU5fVEhVTkspIHtcclxuICAgIHZhciBkYXRhID0gZHluLmRhdGE7XHJcbiAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxyXG4gICAgICBkYXRhLnRoaXNEZXAsXHJcbiAgICAgIGRhdGEuY29udGV4dERlcCxcclxuICAgICAgZGF0YS5wcm9wRGVwLFxyXG4gICAgICBhcHBlbmQpXHJcbiAgfSBlbHNlIHtcclxuICAgIHJldHVybiBuZXcgRGVjbGFyYXRpb24oXHJcbiAgICAgIHR5cGUgPT09IERZTl9TVEFURSQxLFxyXG4gICAgICB0eXBlID09PSBEWU5fQ09OVEVYVCQxLFxyXG4gICAgICB0eXBlID09PSBEWU5fUFJPUCQxLFxyXG4gICAgICBhcHBlbmQpXHJcbiAgfVxyXG59XHJcblxyXG52YXIgU0NPUEVfREVDTCA9IG5ldyBEZWNsYXJhdGlvbihmYWxzZSwgZmFsc2UsIGZhbHNlLCBmdW5jdGlvbiAoKSB7fSk7XHJcblxyXG5mdW5jdGlvbiByZWdsQ29yZSAoXHJcbiAgZ2wsXHJcbiAgc3RyaW5nU3RvcmUsXHJcbiAgZXh0ZW5zaW9ucyxcclxuICBsaW1pdHMsXHJcbiAgYnVmZmVyU3RhdGUsXHJcbiAgZWxlbWVudFN0YXRlLFxyXG4gIHRleHR1cmVTdGF0ZSxcclxuICBmcmFtZWJ1ZmZlclN0YXRlLFxyXG4gIHVuaWZvcm1TdGF0ZSxcclxuICBhdHRyaWJ1dGVTdGF0ZSxcclxuICBzaGFkZXJTdGF0ZSxcclxuICBkcmF3U3RhdGUsXHJcbiAgY29udGV4dFN0YXRlLFxyXG4gIHRpbWVyLFxyXG4gIGNvbmZpZykge1xyXG4gIHZhciBBdHRyaWJ1dGVSZWNvcmQgPSBhdHRyaWJ1dGVTdGF0ZS5SZWNvcmQ7XHJcblxyXG4gIHZhciBibGVuZEVxdWF0aW9ucyA9IHtcclxuICAgICdhZGQnOiAzMjc3NCxcclxuICAgICdzdWJ0cmFjdCc6IDMyNzc4LFxyXG4gICAgJ3JldmVyc2Ugc3VidHJhY3QnOiAzMjc3OVxyXG4gIH07XHJcbiAgaWYgKGV4dGVuc2lvbnMuZXh0X2JsZW5kX21pbm1heCkge1xyXG4gICAgYmxlbmRFcXVhdGlvbnMubWluID0gR0xfTUlOX0VYVDtcclxuICAgIGJsZW5kRXF1YXRpb25zLm1heCA9IEdMX01BWF9FWFQ7XHJcbiAgfVxyXG5cclxuICB2YXIgZXh0SW5zdGFuY2luZyA9IGV4dGVuc2lvbnMuYW5nbGVfaW5zdGFuY2VkX2FycmF5cztcclxuICB2YXIgZXh0RHJhd0J1ZmZlcnMgPSBleHRlbnNpb25zLndlYmdsX2RyYXdfYnVmZmVycztcclxuXHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgLy8gV0VCR0wgU1RBVEVcclxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICB2YXIgY3VycmVudFN0YXRlID0ge1xyXG4gICAgZGlydHk6IHRydWUsXHJcbiAgICBwcm9maWxlOiBjb25maWcucHJvZmlsZVxyXG4gIH07XHJcbiAgdmFyIG5leHRTdGF0ZSA9IHt9O1xyXG4gIHZhciBHTF9TVEFURV9OQU1FUyA9IFtdO1xyXG4gIHZhciBHTF9GTEFHUyA9IHt9O1xyXG4gIHZhciBHTF9WQVJJQUJMRVMgPSB7fTtcclxuXHJcbiAgZnVuY3Rpb24gcHJvcE5hbWUgKG5hbWUpIHtcclxuICAgIHJldHVybiBuYW1lLnJlcGxhY2UoJy4nLCAnXycpXHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBzdGF0ZUZsYWcgKHNuYW1lLCBjYXAsIGluaXQpIHtcclxuICAgIHZhciBuYW1lID0gcHJvcE5hbWUoc25hbWUpO1xyXG4gICAgR0xfU1RBVEVfTkFNRVMucHVzaChzbmFtZSk7XHJcbiAgICBuZXh0U3RhdGVbbmFtZV0gPSBjdXJyZW50U3RhdGVbbmFtZV0gPSAhIWluaXQ7XHJcbiAgICBHTF9GTEFHU1tuYW1lXSA9IGNhcDtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHN0YXRlVmFyaWFibGUgKHNuYW1lLCBmdW5jLCBpbml0KSB7XHJcbiAgICB2YXIgbmFtZSA9IHByb3BOYW1lKHNuYW1lKTtcclxuICAgIEdMX1NUQVRFX05BTUVTLnB1c2goc25hbWUpO1xyXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoaW5pdCkpIHtcclxuICAgICAgY3VycmVudFN0YXRlW25hbWVdID0gaW5pdC5zbGljZSgpO1xyXG4gICAgICBuZXh0U3RhdGVbbmFtZV0gPSBpbml0LnNsaWNlKCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBjdXJyZW50U3RhdGVbbmFtZV0gPSBuZXh0U3RhdGVbbmFtZV0gPSBpbml0O1xyXG4gICAgfVxyXG4gICAgR0xfVkFSSUFCTEVTW25hbWVdID0gZnVuYztcclxuICB9XHJcblxyXG4gIC8vIERpdGhlcmluZ1xyXG4gIHN0YXRlRmxhZyhTX0RJVEhFUiwgR0xfRElUSEVSKTtcclxuXHJcbiAgLy8gQmxlbmRpbmdcclxuICBzdGF0ZUZsYWcoU19CTEVORF9FTkFCTEUsIEdMX0JMRU5EKTtcclxuICBzdGF0ZVZhcmlhYmxlKFNfQkxFTkRfQ09MT1IsICdibGVuZENvbG9yJywgWzAsIDAsIDAsIDBdKTtcclxuICBzdGF0ZVZhcmlhYmxlKFNfQkxFTkRfRVFVQVRJT04sICdibGVuZEVxdWF0aW9uU2VwYXJhdGUnLFxyXG4gICAgW0dMX0ZVTkNfQURELCBHTF9GVU5DX0FERF0pO1xyXG4gIHN0YXRlVmFyaWFibGUoU19CTEVORF9GVU5DLCAnYmxlbmRGdW5jU2VwYXJhdGUnLFxyXG4gICAgW0dMX09ORSwgR0xfWkVSTywgR0xfT05FLCBHTF9aRVJPXSk7XHJcblxyXG4gIC8vIERlcHRoXHJcbiAgc3RhdGVGbGFnKFNfREVQVEhfRU5BQkxFLCBHTF9ERVBUSF9URVNULCB0cnVlKTtcclxuICBzdGF0ZVZhcmlhYmxlKFNfREVQVEhfRlVOQywgJ2RlcHRoRnVuYycsIEdMX0xFU1MpO1xyXG4gIHN0YXRlVmFyaWFibGUoU19ERVBUSF9SQU5HRSwgJ2RlcHRoUmFuZ2UnLCBbMCwgMV0pO1xyXG4gIHN0YXRlVmFyaWFibGUoU19ERVBUSF9NQVNLLCAnZGVwdGhNYXNrJywgdHJ1ZSk7XHJcblxyXG4gIC8vIENvbG9yIG1hc2tcclxuICBzdGF0ZVZhcmlhYmxlKFNfQ09MT1JfTUFTSywgU19DT0xPUl9NQVNLLCBbdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZV0pO1xyXG5cclxuICAvLyBGYWNlIGN1bGxpbmdcclxuICBzdGF0ZUZsYWcoU19DVUxMX0VOQUJMRSwgR0xfQ1VMTF9GQUNFKTtcclxuICBzdGF0ZVZhcmlhYmxlKFNfQ1VMTF9GQUNFLCAnY3VsbEZhY2UnLCBHTF9CQUNLKTtcclxuXHJcbiAgLy8gRnJvbnQgZmFjZSBvcmllbnRhdGlvblxyXG4gIHN0YXRlVmFyaWFibGUoU19GUk9OVF9GQUNFLCBTX0ZST05UX0ZBQ0UsIEdMX0NDVyk7XHJcblxyXG4gIC8vIExpbmUgd2lkdGhcclxuICBzdGF0ZVZhcmlhYmxlKFNfTElORV9XSURUSCwgU19MSU5FX1dJRFRILCAxKTtcclxuXHJcbiAgLy8gUG9seWdvbiBvZmZzZXRcclxuICBzdGF0ZUZsYWcoU19QT0xZR09OX09GRlNFVF9FTkFCTEUsIEdMX1BPTFlHT05fT0ZGU0VUX0ZJTEwpO1xyXG4gIHN0YXRlVmFyaWFibGUoU19QT0xZR09OX09GRlNFVF9PRkZTRVQsICdwb2x5Z29uT2Zmc2V0JywgWzAsIDBdKTtcclxuXHJcbiAgLy8gU2FtcGxlIGNvdmVyYWdlXHJcbiAgc3RhdGVGbGFnKFNfU0FNUExFX0FMUEhBLCBHTF9TQU1QTEVfQUxQSEFfVE9fQ09WRVJBR0UpO1xyXG4gIHN0YXRlRmxhZyhTX1NBTVBMRV9FTkFCTEUsIEdMX1NBTVBMRV9DT1ZFUkFHRSk7XHJcbiAgc3RhdGVWYXJpYWJsZShTX1NBTVBMRV9DT1ZFUkFHRSwgJ3NhbXBsZUNvdmVyYWdlJywgWzEsIGZhbHNlXSk7XHJcblxyXG4gIC8vIFN0ZW5jaWxcclxuICBzdGF0ZUZsYWcoU19TVEVOQ0lMX0VOQUJMRSwgR0xfU1RFTkNJTF9URVNUKTtcclxuICBzdGF0ZVZhcmlhYmxlKFNfU1RFTkNJTF9NQVNLLCAnc3RlbmNpbE1hc2snLCAtMSk7XHJcbiAgc3RhdGVWYXJpYWJsZShTX1NURU5DSUxfRlVOQywgJ3N0ZW5jaWxGdW5jJywgW0dMX0FMV0FZUywgMCwgLTFdKTtcclxuICBzdGF0ZVZhcmlhYmxlKFNfU1RFTkNJTF9PUEZST05ULCAnc3RlbmNpbE9wU2VwYXJhdGUnLFxyXG4gICAgW0dMX0ZST05ULCBHTF9LRUVQLCBHTF9LRUVQLCBHTF9LRUVQXSk7XHJcbiAgc3RhdGVWYXJpYWJsZShTX1NURU5DSUxfT1BCQUNLLCAnc3RlbmNpbE9wU2VwYXJhdGUnLFxyXG4gICAgW0dMX0JBQ0ssIEdMX0tFRVAsIEdMX0tFRVAsIEdMX0tFRVBdKTtcclxuXHJcbiAgLy8gU2Npc3NvclxyXG4gIHN0YXRlRmxhZyhTX1NDSVNTT1JfRU5BQkxFLCBHTF9TQ0lTU09SX1RFU1QpO1xyXG4gIHN0YXRlVmFyaWFibGUoU19TQ0lTU09SX0JPWCwgJ3NjaXNzb3InLFxyXG4gICAgWzAsIDAsIGdsLmRyYXdpbmdCdWZmZXJXaWR0aCwgZ2wuZHJhd2luZ0J1ZmZlckhlaWdodF0pO1xyXG5cclxuICAvLyBWaWV3cG9ydFxyXG4gIHN0YXRlVmFyaWFibGUoU19WSUVXUE9SVCwgU19WSUVXUE9SVCxcclxuICAgIFswLCAwLCBnbC5kcmF3aW5nQnVmZmVyV2lkdGgsIGdsLmRyYXdpbmdCdWZmZXJIZWlnaHRdKTtcclxuXHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgLy8gRU5WSVJPTk1FTlRcclxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICB2YXIgc2hhcmVkU3RhdGUgPSB7XHJcbiAgICBnbDogZ2wsXHJcbiAgICBjb250ZXh0OiBjb250ZXh0U3RhdGUsXHJcbiAgICBzdHJpbmdzOiBzdHJpbmdTdG9yZSxcclxuICAgIG5leHQ6IG5leHRTdGF0ZSxcclxuICAgIGN1cnJlbnQ6IGN1cnJlbnRTdGF0ZSxcclxuICAgIGRyYXc6IGRyYXdTdGF0ZSxcclxuICAgIGVsZW1lbnRzOiBlbGVtZW50U3RhdGUsXHJcbiAgICBidWZmZXI6IGJ1ZmZlclN0YXRlLFxyXG4gICAgc2hhZGVyOiBzaGFkZXJTdGF0ZSxcclxuICAgIGF0dHJpYnV0ZXM6IGF0dHJpYnV0ZVN0YXRlLnN0YXRlLFxyXG4gICAgdW5pZm9ybXM6IHVuaWZvcm1TdGF0ZSxcclxuICAgIGZyYW1lYnVmZmVyOiBmcmFtZWJ1ZmZlclN0YXRlLFxyXG4gICAgZXh0ZW5zaW9uczogZXh0ZW5zaW9ucyxcclxuXHJcbiAgICB0aW1lcjogdGltZXIsXHJcbiAgICBpc0J1ZmZlckFyZ3M6IGlzQnVmZmVyQXJnc1xyXG4gIH07XHJcblxyXG4gIHZhciBzaGFyZWRDb25zdGFudHMgPSB7XHJcbiAgICBwcmltVHlwZXM6IHByaW1UeXBlcyxcclxuICAgIGNvbXBhcmVGdW5jczogY29tcGFyZUZ1bmNzLFxyXG4gICAgYmxlbmRGdW5jczogYmxlbmRGdW5jcyxcclxuICAgIGJsZW5kRXF1YXRpb25zOiBibGVuZEVxdWF0aW9ucyxcclxuICAgIHN0ZW5jaWxPcHM6IHN0ZW5jaWxPcHMsXHJcbiAgICBnbFR5cGVzOiBnbFR5cGVzLFxyXG4gICAgb3JpZW50YXRpb25UeXBlOiBvcmllbnRhdGlvblR5cGVcclxuICB9O1xyXG5cclxuICBjaGVjayQxLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcclxuICAgIHNoYXJlZFN0YXRlLmlzQXJyYXlMaWtlID0gaXNBcnJheUxpa2U7XHJcbiAgfSk7XHJcblxyXG4gIGlmIChleHREcmF3QnVmZmVycykge1xyXG4gICAgc2hhcmVkQ29uc3RhbnRzLmJhY2tCdWZmZXIgPSBbR0xfQkFDS107XHJcbiAgICBzaGFyZWRDb25zdGFudHMuZHJhd0J1ZmZlciA9IGxvb3AobGltaXRzLm1heERyYXdidWZmZXJzLCBmdW5jdGlvbiAoaSkge1xyXG4gICAgICBpZiAoaSA9PT0gMCkge1xyXG4gICAgICAgIHJldHVybiBbMF1cclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gbG9vcChpLCBmdW5jdGlvbiAoaikge1xyXG4gICAgICAgIHJldHVybiBHTF9DT0xPUl9BVFRBQ0hNRU5UMCQyICsgalxyXG4gICAgICB9KVxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICB2YXIgZHJhd0NhbGxDb3VudGVyID0gMDtcclxuICBmdW5jdGlvbiBjcmVhdGVSRUdMRW52aXJvbm1lbnQgKCkge1xyXG4gICAgdmFyIGVudiA9IGNyZWF0ZUVudmlyb25tZW50KCk7XHJcbiAgICB2YXIgbGluayA9IGVudi5saW5rO1xyXG4gICAgdmFyIGdsb2JhbCA9IGVudi5nbG9iYWw7XHJcbiAgICBlbnYuaWQgPSBkcmF3Q2FsbENvdW50ZXIrKztcclxuXHJcbiAgICBlbnYuYmF0Y2hJZCA9ICcwJztcclxuXHJcbiAgICAvLyBsaW5rIHNoYXJlZCBzdGF0ZVxyXG4gICAgdmFyIFNIQVJFRCA9IGxpbmsoc2hhcmVkU3RhdGUpO1xyXG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWQgPSB7XHJcbiAgICAgIHByb3BzOiAnYTAnXHJcbiAgICB9O1xyXG4gICAgT2JqZWN0LmtleXMoc2hhcmVkU3RhdGUpLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcclxuICAgICAgc2hhcmVkW3Byb3BdID0gZ2xvYmFsLmRlZihTSEFSRUQsICcuJywgcHJvcCk7XHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBJbmplY3QgcnVudGltZSBhc3NlcnRpb24gc3R1ZmYgZm9yIGRlYnVnIGJ1aWxkc1xyXG4gICAgY2hlY2skMS5vcHRpb25hbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgIGVudi5DSEVDSyA9IGxpbmsoY2hlY2skMSk7XHJcbiAgICAgIGVudi5jb21tYW5kU3RyID0gY2hlY2skMS5ndWVzc0NvbW1hbmQoKTtcclxuICAgICAgZW52LmNvbW1hbmQgPSBsaW5rKGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgZW52LmFzc2VydCA9IGZ1bmN0aW9uIChibG9jaywgcHJlZCwgbWVzc2FnZSkge1xyXG4gICAgICAgIGJsb2NrKFxyXG4gICAgICAgICAgJ2lmKCEoJywgcHJlZCwgJykpJyxcclxuICAgICAgICAgIHRoaXMuQ0hFQ0ssICcuY29tbWFuZFJhaXNlKCcsIGxpbmsobWVzc2FnZSksICcsJywgdGhpcy5jb21tYW5kLCAnKTsnKTtcclxuICAgICAgfTtcclxuXHJcbiAgICAgIHNoYXJlZENvbnN0YW50cy5pbnZhbGlkQmxlbmRDb21iaW5hdGlvbnMgPSBpbnZhbGlkQmxlbmRDb21iaW5hdGlvbnM7XHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDb3B5IEdMIHN0YXRlIHZhcmlhYmxlcyBvdmVyXHJcbiAgICB2YXIgbmV4dFZhcnMgPSBlbnYubmV4dCA9IHt9O1xyXG4gICAgdmFyIGN1cnJlbnRWYXJzID0gZW52LmN1cnJlbnQgPSB7fTtcclxuICAgIE9iamVjdC5rZXlzKEdMX1ZBUklBQkxFUykuZm9yRWFjaChmdW5jdGlvbiAodmFyaWFibGUpIHtcclxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoY3VycmVudFN0YXRlW3ZhcmlhYmxlXSkpIHtcclxuICAgICAgICBuZXh0VmFyc1t2YXJpYWJsZV0gPSBnbG9iYWwuZGVmKHNoYXJlZC5uZXh0LCAnLicsIHZhcmlhYmxlKTtcclxuICAgICAgICBjdXJyZW50VmFyc1t2YXJpYWJsZV0gPSBnbG9iYWwuZGVmKHNoYXJlZC5jdXJyZW50LCAnLicsIHZhcmlhYmxlKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gSW5pdGlhbGl6ZSBzaGFyZWQgY29uc3RhbnRzXHJcbiAgICB2YXIgY29uc3RhbnRzID0gZW52LmNvbnN0YW50cyA9IHt9O1xyXG4gICAgT2JqZWN0LmtleXMoc2hhcmVkQ29uc3RhbnRzKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XHJcbiAgICAgIGNvbnN0YW50c1tuYW1lXSA9IGdsb2JhbC5kZWYoSlNPTi5zdHJpbmdpZnkoc2hhcmVkQ29uc3RhbnRzW25hbWVdKSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBIZWxwZXIgZnVuY3Rpb24gZm9yIGNhbGxpbmcgYSBibG9ja1xyXG4gICAgZW52Lmludm9rZSA9IGZ1bmN0aW9uIChibG9jaywgeCkge1xyXG4gICAgICBzd2l0Y2ggKHgudHlwZSkge1xyXG4gICAgICAgIGNhc2UgRFlOX0ZVTkMkMTpcclxuICAgICAgICAgIHZhciBhcmdMaXN0ID0gW1xyXG4gICAgICAgICAgICAndGhpcycsXHJcbiAgICAgICAgICAgIHNoYXJlZC5jb250ZXh0LFxyXG4gICAgICAgICAgICBzaGFyZWQucHJvcHMsXHJcbiAgICAgICAgICAgIGVudi5iYXRjaElkXHJcbiAgICAgICAgICBdO1xyXG4gICAgICAgICAgcmV0dXJuIGJsb2NrLmRlZihcclxuICAgICAgICAgICAgbGluayh4LmRhdGEpLCAnLmNhbGwoJyxcclxuICAgICAgICAgICAgICBhcmdMaXN0LnNsaWNlKDAsIE1hdGgubWF4KHguZGF0YS5sZW5ndGggKyAxLCA0KSksXHJcbiAgICAgICAgICAgICAnKScpXHJcbiAgICAgICAgY2FzZSBEWU5fUFJPUCQxOlxyXG4gICAgICAgICAgcmV0dXJuIGJsb2NrLmRlZihzaGFyZWQucHJvcHMsIHguZGF0YSlcclxuICAgICAgICBjYXNlIERZTl9DT05URVhUJDE6XHJcbiAgICAgICAgICByZXR1cm4gYmxvY2suZGVmKHNoYXJlZC5jb250ZXh0LCB4LmRhdGEpXHJcbiAgICAgICAgY2FzZSBEWU5fU1RBVEUkMTpcclxuICAgICAgICAgIHJldHVybiBibG9jay5kZWYoJ3RoaXMnLCB4LmRhdGEpXHJcbiAgICAgICAgY2FzZSBEWU5fVEhVTks6XHJcbiAgICAgICAgICB4LmRhdGEuYXBwZW5kKGVudiwgYmxvY2spO1xyXG4gICAgICAgICAgcmV0dXJuIHguZGF0YS5yZWZcclxuICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICBlbnYuYXR0cmliQ2FjaGUgPSB7fTtcclxuXHJcbiAgICB2YXIgc2NvcGVBdHRyaWJzID0ge307XHJcbiAgICBlbnYuc2NvcGVBdHRyaWIgPSBmdW5jdGlvbiAobmFtZSkge1xyXG4gICAgICB2YXIgaWQgPSBzdHJpbmdTdG9yZS5pZChuYW1lKTtcclxuICAgICAgaWYgKGlkIGluIHNjb3BlQXR0cmlicykge1xyXG4gICAgICAgIHJldHVybiBzY29wZUF0dHJpYnNbaWRdXHJcbiAgICAgIH1cclxuICAgICAgdmFyIGJpbmRpbmcgPSBhdHRyaWJ1dGVTdGF0ZS5zY29wZVtpZF07XHJcbiAgICAgIGlmICghYmluZGluZykge1xyXG4gICAgICAgIGJpbmRpbmcgPSBhdHRyaWJ1dGVTdGF0ZS5zY29wZVtpZF0gPSBuZXcgQXR0cmlidXRlUmVjb3JkKCk7XHJcbiAgICAgIH1cclxuICAgICAgdmFyIHJlc3VsdCA9IHNjb3BlQXR0cmlic1tpZF0gPSBsaW5rKGJpbmRpbmcpO1xyXG4gICAgICByZXR1cm4gcmVzdWx0XHJcbiAgICB9O1xyXG5cclxuICAgIHJldHVybiBlbnZcclxuICB9XHJcblxyXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gIC8vIFBBUlNJTkdcclxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICBmdW5jdGlvbiBwYXJzZVByb2ZpbGUgKG9wdGlvbnMpIHtcclxuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWM7XHJcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWM7XHJcblxyXG4gICAgdmFyIHByb2ZpbGVFbmFibGU7XHJcbiAgICBpZiAoU19QUk9GSUxFIGluIHN0YXRpY09wdGlvbnMpIHtcclxuICAgICAgdmFyIHZhbHVlID0gISFzdGF0aWNPcHRpb25zW1NfUFJPRklMRV07XHJcbiAgICAgIHByb2ZpbGVFbmFibGUgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XHJcbiAgICAgICAgcmV0dXJuIHZhbHVlXHJcbiAgICAgIH0pO1xyXG4gICAgICBwcm9maWxlRW5hYmxlLmVuYWJsZSA9IHZhbHVlO1xyXG4gICAgfSBlbHNlIGlmIChTX1BST0ZJTEUgaW4gZHluYW1pY09wdGlvbnMpIHtcclxuICAgICAgdmFyIGR5biA9IGR5bmFtaWNPcHRpb25zW1NfUFJPRklMRV07XHJcbiAgICAgIHByb2ZpbGVFbmFibGUgPSBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XHJcbiAgICAgICAgcmV0dXJuIGVudi5pbnZva2Uoc2NvcGUsIGR5bilcclxuICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHByb2ZpbGVFbmFibGVcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHBhcnNlRnJhbWVidWZmZXIgKG9wdGlvbnMsIGVudikge1xyXG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpYztcclxuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pYztcclxuXHJcbiAgICBpZiAoU19GUkFNRUJVRkZFUiBpbiBzdGF0aWNPcHRpb25zKSB7XHJcbiAgICAgIHZhciBmcmFtZWJ1ZmZlciA9IHN0YXRpY09wdGlvbnNbU19GUkFNRUJVRkZFUl07XHJcbiAgICAgIGlmIChmcmFtZWJ1ZmZlcikge1xyXG4gICAgICAgIGZyYW1lYnVmZmVyID0gZnJhbWVidWZmZXJTdGF0ZS5nZXRGcmFtZWJ1ZmZlcihmcmFtZWJ1ZmZlcik7XHJcbiAgICAgICAgY2hlY2skMS5jb21tYW5kKGZyYW1lYnVmZmVyLCAnaW52YWxpZCBmcmFtZWJ1ZmZlciBvYmplY3QnKTtcclxuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBibG9jaykge1xyXG4gICAgICAgICAgdmFyIEZSQU1FQlVGRkVSID0gZW52LmxpbmsoZnJhbWVidWZmZXIpO1xyXG4gICAgICAgICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWQ7XHJcbiAgICAgICAgICBibG9jay5zZXQoXHJcbiAgICAgICAgICAgIHNoYXJlZC5mcmFtZWJ1ZmZlcixcclxuICAgICAgICAgICAgJy5uZXh0JyxcclxuICAgICAgICAgICAgRlJBTUVCVUZGRVIpO1xyXG4gICAgICAgICAgdmFyIENPTlRFWFQgPSBzaGFyZWQuY29udGV4dDtcclxuICAgICAgICAgIGJsb2NrLnNldChcclxuICAgICAgICAgICAgQ09OVEVYVCxcclxuICAgICAgICAgICAgJy4nICsgU19GUkFNRUJVRkZFUl9XSURUSCxcclxuICAgICAgICAgICAgRlJBTUVCVUZGRVIgKyAnLndpZHRoJyk7XHJcbiAgICAgICAgICBibG9jay5zZXQoXHJcbiAgICAgICAgICAgIENPTlRFWFQsXHJcbiAgICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfSEVJR0hULFxyXG4gICAgICAgICAgICBGUkFNRUJVRkZFUiArICcuaGVpZ2h0Jyk7XHJcbiAgICAgICAgICByZXR1cm4gRlJBTUVCVUZGRVJcclxuICAgICAgICB9KVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XHJcbiAgICAgICAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZDtcclxuICAgICAgICAgIHNjb3BlLnNldChcclxuICAgICAgICAgICAgc2hhcmVkLmZyYW1lYnVmZmVyLFxyXG4gICAgICAgICAgICAnLm5leHQnLFxyXG4gICAgICAgICAgICAnbnVsbCcpO1xyXG4gICAgICAgICAgdmFyIENPTlRFWFQgPSBzaGFyZWQuY29udGV4dDtcclxuICAgICAgICAgIHNjb3BlLnNldChcclxuICAgICAgICAgICAgQ09OVEVYVCxcclxuICAgICAgICAgICAgJy4nICsgU19GUkFNRUJVRkZFUl9XSURUSCxcclxuICAgICAgICAgICAgQ09OVEVYVCArICcuJyArIFNfRFJBV0lOR0JVRkZFUl9XSURUSCk7XHJcbiAgICAgICAgICBzY29wZS5zZXQoXHJcbiAgICAgICAgICAgIENPTlRFWFQsXHJcbiAgICAgICAgICAgICcuJyArIFNfRlJBTUVCVUZGRVJfSEVJR0hULFxyXG4gICAgICAgICAgICBDT05URVhUICsgJy4nICsgU19EUkFXSU5HQlVGRkVSX0hFSUdIVCk7XHJcbiAgICAgICAgICByZXR1cm4gJ251bGwnXHJcbiAgICAgICAgfSlcclxuICAgICAgfVxyXG4gICAgfSBlbHNlIGlmIChTX0ZSQU1FQlVGRkVSIGluIGR5bmFtaWNPcHRpb25zKSB7XHJcbiAgICAgIHZhciBkeW4gPSBkeW5hbWljT3B0aW9uc1tTX0ZSQU1FQlVGRkVSXTtcclxuICAgICAgcmV0dXJuIGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcclxuICAgICAgICB2YXIgRlJBTUVCVUZGRVJfRlVOQyA9IGVudi5pbnZva2Uoc2NvcGUsIGR5bik7XHJcbiAgICAgICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWQ7XHJcbiAgICAgICAgdmFyIEZSQU1FQlVGRkVSX1NUQVRFID0gc2hhcmVkLmZyYW1lYnVmZmVyO1xyXG4gICAgICAgIHZhciBGUkFNRUJVRkZFUiA9IHNjb3BlLmRlZihcclxuICAgICAgICAgIEZSQU1FQlVGRkVSX1NUQVRFLCAnLmdldEZyYW1lYnVmZmVyKCcsIEZSQU1FQlVGRkVSX0ZVTkMsICcpJyk7XHJcblxyXG4gICAgICAgIGNoZWNrJDEub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgZW52LmFzc2VydChzY29wZSxcclxuICAgICAgICAgICAgJyEnICsgRlJBTUVCVUZGRVJfRlVOQyArICd8fCcgKyBGUkFNRUJVRkZFUixcclxuICAgICAgICAgICAgJ2ludmFsaWQgZnJhbWVidWZmZXIgb2JqZWN0Jyk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHNjb3BlLnNldChcclxuICAgICAgICAgIEZSQU1FQlVGRkVSX1NUQVRFLFxyXG4gICAgICAgICAgJy5uZXh0JyxcclxuICAgICAgICAgIEZSQU1FQlVGRkVSKTtcclxuICAgICAgICB2YXIgQ09OVEVYVCA9IHNoYXJlZC5jb250ZXh0O1xyXG4gICAgICAgIHNjb3BlLnNldChcclxuICAgICAgICAgIENPTlRFWFQsXHJcbiAgICAgICAgICAnLicgKyBTX0ZSQU1FQlVGRkVSX1dJRFRILFxyXG4gICAgICAgICAgRlJBTUVCVUZGRVIgKyAnPycgKyBGUkFNRUJVRkZFUiArICcud2lkdGg6JyArXHJcbiAgICAgICAgICBDT05URVhUICsgJy4nICsgU19EUkFXSU5HQlVGRkVSX1dJRFRIKTtcclxuICAgICAgICBzY29wZS5zZXQoXHJcbiAgICAgICAgICBDT05URVhULFxyXG4gICAgICAgICAgJy4nICsgU19GUkFNRUJVRkZFUl9IRUlHSFQsXHJcbiAgICAgICAgICBGUkFNRUJVRkZFUiArXHJcbiAgICAgICAgICAnPycgKyBGUkFNRUJVRkZFUiArICcuaGVpZ2h0OicgK1xyXG4gICAgICAgICAgQ09OVEVYVCArICcuJyArIFNfRFJBV0lOR0JVRkZFUl9IRUlHSFQpO1xyXG4gICAgICAgIHJldHVybiBGUkFNRUJVRkZFUlxyXG4gICAgICB9KVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgcmV0dXJuIG51bGxcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHBhcnNlVmlld3BvcnRTY2lzc29yIChvcHRpb25zLCBmcmFtZWJ1ZmZlciwgZW52KSB7XHJcbiAgICB2YXIgc3RhdGljT3B0aW9ucyA9IG9wdGlvbnMuc3RhdGljO1xyXG4gICAgdmFyIGR5bmFtaWNPcHRpb25zID0gb3B0aW9ucy5keW5hbWljO1xyXG5cclxuICAgIGZ1bmN0aW9uIHBhcnNlQm94IChwYXJhbSkge1xyXG4gICAgICBpZiAocGFyYW0gaW4gc3RhdGljT3B0aW9ucykge1xyXG4gICAgICAgIHZhciBib3ggPSBzdGF0aWNPcHRpb25zW3BhcmFtXTtcclxuICAgICAgICBjaGVjayQxLmNvbW1hbmRUeXBlKGJveCwgJ29iamVjdCcsICdpbnZhbGlkICcgKyBwYXJhbSwgZW52LmNvbW1hbmRTdHIpO1xyXG5cclxuICAgICAgICB2YXIgaXNTdGF0aWMgPSB0cnVlO1xyXG4gICAgICAgIHZhciB4ID0gYm94LnggfCAwO1xyXG4gICAgICAgIHZhciB5ID0gYm94LnkgfCAwO1xyXG4gICAgICAgIHZhciB3LCBoO1xyXG4gICAgICAgIGlmICgnd2lkdGgnIGluIGJveCkge1xyXG4gICAgICAgICAgdyA9IGJveC53aWR0aCB8IDA7XHJcbiAgICAgICAgICBjaGVjayQxLmNvbW1hbmQodyA+PSAwLCAnaW52YWxpZCAnICsgcGFyYW0sIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgaXNTdGF0aWMgPSBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKCdoZWlnaHQnIGluIGJveCkge1xyXG4gICAgICAgICAgaCA9IGJveC5oZWlnaHQgfCAwO1xyXG4gICAgICAgICAgY2hlY2skMS5jb21tYW5kKGggPj0gMCwgJ2ludmFsaWQgJyArIHBhcmFtLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGlzU3RhdGljID0gZmFsc2U7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gbmV3IERlY2xhcmF0aW9uKFxyXG4gICAgICAgICAgIWlzU3RhdGljICYmIGZyYW1lYnVmZmVyICYmIGZyYW1lYnVmZmVyLnRoaXNEZXAsXHJcbiAgICAgICAgICAhaXNTdGF0aWMgJiYgZnJhbWVidWZmZXIgJiYgZnJhbWVidWZmZXIuY29udGV4dERlcCxcclxuICAgICAgICAgICFpc1N0YXRpYyAmJiBmcmFtZWJ1ZmZlciAmJiBmcmFtZWJ1ZmZlci5wcm9wRGVwLFxyXG4gICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcclxuICAgICAgICAgICAgdmFyIENPTlRFWFQgPSBlbnYuc2hhcmVkLmNvbnRleHQ7XHJcbiAgICAgICAgICAgIHZhciBCT1hfVyA9IHc7XHJcbiAgICAgICAgICAgIGlmICghKCd3aWR0aCcgaW4gYm94KSkge1xyXG4gICAgICAgICAgICAgIEJPWF9XID0gc2NvcGUuZGVmKENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9XSURUSCwgJy0nLCB4KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB2YXIgQk9YX0ggPSBoO1xyXG4gICAgICAgICAgICBpZiAoISgnaGVpZ2h0JyBpbiBib3gpKSB7XHJcbiAgICAgICAgICAgICAgQk9YX0ggPSBzY29wZS5kZWYoQ09OVEVYVCwgJy4nLCBTX0ZSQU1FQlVGRkVSX0hFSUdIVCwgJy0nLCB5KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gW3gsIHksIEJPWF9XLCBCT1hfSF1cclxuICAgICAgICAgIH0pXHJcbiAgICAgIH0gZWxzZSBpZiAocGFyYW0gaW4gZHluYW1pY09wdGlvbnMpIHtcclxuICAgICAgICB2YXIgZHluQm94ID0gZHluYW1pY09wdGlvbnNbcGFyYW1dO1xyXG4gICAgICAgIHZhciByZXN1bHQgPSBjcmVhdGVEeW5hbWljRGVjbChkeW5Cb3gsIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XHJcbiAgICAgICAgICB2YXIgQk9YID0gZW52Lmludm9rZShzY29wZSwgZHluQm94KTtcclxuXHJcbiAgICAgICAgICBjaGVjayQxLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcclxuICAgICAgICAgICAgICBCT1ggKyAnJiZ0eXBlb2YgJyArIEJPWCArICc9PT1cIm9iamVjdFwiJyxcclxuICAgICAgICAgICAgICAnaW52YWxpZCAnICsgcGFyYW0pO1xyXG4gICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgdmFyIENPTlRFWFQgPSBlbnYuc2hhcmVkLmNvbnRleHQ7XHJcbiAgICAgICAgICB2YXIgQk9YX1ggPSBzY29wZS5kZWYoQk9YLCAnLnh8MCcpO1xyXG4gICAgICAgICAgdmFyIEJPWF9ZID0gc2NvcGUuZGVmKEJPWCwgJy55fDAnKTtcclxuICAgICAgICAgIHZhciBCT1hfVyA9IHNjb3BlLmRlZihcclxuICAgICAgICAgICAgJ1wid2lkdGhcIiBpbiAnLCBCT1gsICc/JywgQk9YLCAnLndpZHRofDA6JyxcclxuICAgICAgICAgICAgJygnLCBDT05URVhULCAnLicsIFNfRlJBTUVCVUZGRVJfV0lEVEgsICctJywgQk9YX1gsICcpJyk7XHJcbiAgICAgICAgICB2YXIgQk9YX0ggPSBzY29wZS5kZWYoXHJcbiAgICAgICAgICAgICdcImhlaWdodFwiIGluICcsIEJPWCwgJz8nLCBCT1gsICcuaGVpZ2h0fDA6JyxcclxuICAgICAgICAgICAgJygnLCBDT05URVhULCAnLicsIFNfRlJBTUVCVUZGRVJfSEVJR0hULCAnLScsIEJPWF9ZLCAnKScpO1xyXG5cclxuICAgICAgICAgIGNoZWNrJDEub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxyXG4gICAgICAgICAgICAgIEJPWF9XICsgJz49MCYmJyArXHJcbiAgICAgICAgICAgICAgQk9YX0ggKyAnPj0wJyxcclxuICAgICAgICAgICAgICAnaW52YWxpZCAnICsgcGFyYW0pO1xyXG4gICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgcmV0dXJuIFtCT1hfWCwgQk9YX1ksIEJPWF9XLCBCT1hfSF1cclxuICAgICAgICB9KTtcclxuICAgICAgICBpZiAoZnJhbWVidWZmZXIpIHtcclxuICAgICAgICAgIHJlc3VsdC50aGlzRGVwID0gcmVzdWx0LnRoaXNEZXAgfHwgZnJhbWVidWZmZXIudGhpc0RlcDtcclxuICAgICAgICAgIHJlc3VsdC5jb250ZXh0RGVwID0gcmVzdWx0LmNvbnRleHREZXAgfHwgZnJhbWVidWZmZXIuY29udGV4dERlcDtcclxuICAgICAgICAgIHJlc3VsdC5wcm9wRGVwID0gcmVzdWx0LnByb3BEZXAgfHwgZnJhbWVidWZmZXIucHJvcERlcDtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxyXG4gICAgICB9IGVsc2UgaWYgKGZyYW1lYnVmZmVyKSB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcclxuICAgICAgICAgIGZyYW1lYnVmZmVyLnRoaXNEZXAsXHJcbiAgICAgICAgICBmcmFtZWJ1ZmZlci5jb250ZXh0RGVwLFxyXG4gICAgICAgICAgZnJhbWVidWZmZXIucHJvcERlcCxcclxuICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XHJcbiAgICAgICAgICAgIHZhciBDT05URVhUID0gZW52LnNoYXJlZC5jb250ZXh0O1xyXG4gICAgICAgICAgICByZXR1cm4gW1xyXG4gICAgICAgICAgICAgIDAsIDAsXHJcbiAgICAgICAgICAgICAgc2NvcGUuZGVmKENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9XSURUSCksXHJcbiAgICAgICAgICAgICAgc2NvcGUuZGVmKENPTlRFWFQsICcuJywgU19GUkFNRUJVRkZFUl9IRUlHSFQpXVxyXG4gICAgICAgICAgfSlcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICByZXR1cm4gbnVsbFxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIHZpZXdwb3J0ID0gcGFyc2VCb3goU19WSUVXUE9SVCk7XHJcblxyXG4gICAgaWYgKHZpZXdwb3J0KSB7XHJcbiAgICAgIHZhciBwcmV2Vmlld3BvcnQgPSB2aWV3cG9ydDtcclxuICAgICAgdmlld3BvcnQgPSBuZXcgRGVjbGFyYXRpb24oXHJcbiAgICAgICAgdmlld3BvcnQudGhpc0RlcCxcclxuICAgICAgICB2aWV3cG9ydC5jb250ZXh0RGVwLFxyXG4gICAgICAgIHZpZXdwb3J0LnByb3BEZXAsXHJcbiAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcclxuICAgICAgICAgIHZhciBWSUVXUE9SVCA9IHByZXZWaWV3cG9ydC5hcHBlbmQoZW52LCBzY29wZSk7XHJcbiAgICAgICAgICB2YXIgQ09OVEVYVCA9IGVudi5zaGFyZWQuY29udGV4dDtcclxuICAgICAgICAgIHNjb3BlLnNldChcclxuICAgICAgICAgICAgQ09OVEVYVCxcclxuICAgICAgICAgICAgJy4nICsgU19WSUVXUE9SVF9XSURUSCxcclxuICAgICAgICAgICAgVklFV1BPUlRbMl0pO1xyXG4gICAgICAgICAgc2NvcGUuc2V0KFxyXG4gICAgICAgICAgICBDT05URVhULFxyXG4gICAgICAgICAgICAnLicgKyBTX1ZJRVdQT1JUX0hFSUdIVCxcclxuICAgICAgICAgICAgVklFV1BPUlRbM10pO1xyXG4gICAgICAgICAgcmV0dXJuIFZJRVdQT1JUXHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgdmlld3BvcnQ6IHZpZXdwb3J0LFxyXG4gICAgICBzY2lzc29yX2JveDogcGFyc2VCb3goU19TQ0lTU09SX0JPWClcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHBhcnNlUHJvZ3JhbSAob3B0aW9ucykge1xyXG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpYztcclxuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pYztcclxuXHJcbiAgICBmdW5jdGlvbiBwYXJzZVNoYWRlciAobmFtZSkge1xyXG4gICAgICBpZiAobmFtZSBpbiBzdGF0aWNPcHRpb25zKSB7XHJcbiAgICAgICAgdmFyIGlkID0gc3RyaW5nU3RvcmUuaWQoc3RhdGljT3B0aW9uc1tuYW1lXSk7XHJcbiAgICAgICAgY2hlY2skMS5vcHRpb25hbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICBzaGFkZXJTdGF0ZS5zaGFkZXIoc2hhZGVyVHlwZVtuYW1lXSwgaWQsIGNoZWNrJDEuZ3Vlc3NDb21tYW5kKCkpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHZhciByZXN1bHQgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgIHJldHVybiBpZFxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJlc3VsdC5pZCA9IGlkO1xyXG4gICAgICAgIHJldHVybiByZXN1bHRcclxuICAgICAgfSBlbHNlIGlmIChuYW1lIGluIGR5bmFtaWNPcHRpb25zKSB7XHJcbiAgICAgICAgdmFyIGR5biA9IGR5bmFtaWNPcHRpb25zW25hbWVdO1xyXG4gICAgICAgIHJldHVybiBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XHJcbiAgICAgICAgICB2YXIgc3RyID0gZW52Lmludm9rZShzY29wZSwgZHluKTtcclxuICAgICAgICAgIHZhciBpZCA9IHNjb3BlLmRlZihlbnYuc2hhcmVkLnN0cmluZ3MsICcuaWQoJywgc3RyLCAnKScpO1xyXG4gICAgICAgICAgY2hlY2skMS5vcHRpb25hbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIHNjb3BlKFxyXG4gICAgICAgICAgICAgIGVudi5zaGFyZWQuc2hhZGVyLCAnLnNoYWRlcignLFxyXG4gICAgICAgICAgICAgIHNoYWRlclR5cGVbbmFtZV0sICcsJyxcclxuICAgICAgICAgICAgICBpZCwgJywnLFxyXG4gICAgICAgICAgICAgIGVudi5jb21tYW5kLCAnKTsnKTtcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgcmV0dXJuIGlkXHJcbiAgICAgICAgfSlcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gbnVsbFxyXG4gICAgfVxyXG5cclxuICAgIHZhciBmcmFnID0gcGFyc2VTaGFkZXIoU19GUkFHKTtcclxuICAgIHZhciB2ZXJ0ID0gcGFyc2VTaGFkZXIoU19WRVJUKTtcclxuXHJcbiAgICB2YXIgcHJvZ3JhbSA9IG51bGw7XHJcbiAgICB2YXIgcHJvZ1ZhcjtcclxuICAgIGlmIChpc1N0YXRpYyhmcmFnKSAmJiBpc1N0YXRpYyh2ZXJ0KSkge1xyXG4gICAgICBwcm9ncmFtID0gc2hhZGVyU3RhdGUucHJvZ3JhbSh2ZXJ0LmlkLCBmcmFnLmlkKTtcclxuICAgICAgcHJvZ1ZhciA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcclxuICAgICAgICByZXR1cm4gZW52LmxpbmsocHJvZ3JhbSlcclxuICAgICAgfSk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBwcm9nVmFyID0gbmV3IERlY2xhcmF0aW9uKFxyXG4gICAgICAgIChmcmFnICYmIGZyYWcudGhpc0RlcCkgfHwgKHZlcnQgJiYgdmVydC50aGlzRGVwKSxcclxuICAgICAgICAoZnJhZyAmJiBmcmFnLmNvbnRleHREZXApIHx8ICh2ZXJ0ICYmIHZlcnQuY29udGV4dERlcCksXHJcbiAgICAgICAgKGZyYWcgJiYgZnJhZy5wcm9wRGVwKSB8fCAodmVydCAmJiB2ZXJ0LnByb3BEZXApLFxyXG4gICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XHJcbiAgICAgICAgICB2YXIgU0hBREVSX1NUQVRFID0gZW52LnNoYXJlZC5zaGFkZXI7XHJcbiAgICAgICAgICB2YXIgZnJhZ0lkO1xyXG4gICAgICAgICAgaWYgKGZyYWcpIHtcclxuICAgICAgICAgICAgZnJhZ0lkID0gZnJhZy5hcHBlbmQoZW52LCBzY29wZSk7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBmcmFnSWQgPSBzY29wZS5kZWYoU0hBREVSX1NUQVRFLCAnLicsIFNfRlJBRyk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICB2YXIgdmVydElkO1xyXG4gICAgICAgICAgaWYgKHZlcnQpIHtcclxuICAgICAgICAgICAgdmVydElkID0gdmVydC5hcHBlbmQoZW52LCBzY29wZSk7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB2ZXJ0SWQgPSBzY29wZS5kZWYoU0hBREVSX1NUQVRFLCAnLicsIFNfVkVSVCk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICB2YXIgcHJvZ0RlZiA9IFNIQURFUl9TVEFURSArICcucHJvZ3JhbSgnICsgdmVydElkICsgJywnICsgZnJhZ0lkO1xyXG4gICAgICAgICAgY2hlY2skMS5vcHRpb25hbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIHByb2dEZWYgKz0gJywnICsgZW52LmNvbW1hbmQ7XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICAgIHJldHVybiBzY29wZS5kZWYocHJvZ0RlZiArICcpJylcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBmcmFnOiBmcmFnLFxyXG4gICAgICB2ZXJ0OiB2ZXJ0LFxyXG4gICAgICBwcm9nVmFyOiBwcm9nVmFyLFxyXG4gICAgICBwcm9ncmFtOiBwcm9ncmFtXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBwYXJzZURyYXcgKG9wdGlvbnMsIGVudikge1xyXG4gICAgdmFyIHN0YXRpY09wdGlvbnMgPSBvcHRpb25zLnN0YXRpYztcclxuICAgIHZhciBkeW5hbWljT3B0aW9ucyA9IG9wdGlvbnMuZHluYW1pYztcclxuXHJcbiAgICBmdW5jdGlvbiBwYXJzZUVsZW1lbnRzICgpIHtcclxuICAgICAgaWYgKFNfRUxFTUVOVFMgaW4gc3RhdGljT3B0aW9ucykge1xyXG4gICAgICAgIHZhciBlbGVtZW50cyA9IHN0YXRpY09wdGlvbnNbU19FTEVNRU5UU107XHJcbiAgICAgICAgaWYgKGlzQnVmZmVyQXJncyhlbGVtZW50cykpIHtcclxuICAgICAgICAgIGVsZW1lbnRzID0gZWxlbWVudFN0YXRlLmdldEVsZW1lbnRzKGVsZW1lbnRTdGF0ZS5jcmVhdGUoZWxlbWVudHMsIHRydWUpKTtcclxuICAgICAgICB9IGVsc2UgaWYgKGVsZW1lbnRzKSB7XHJcbiAgICAgICAgICBlbGVtZW50cyA9IGVsZW1lbnRTdGF0ZS5nZXRFbGVtZW50cyhlbGVtZW50cyk7XHJcbiAgICAgICAgICBjaGVjayQxLmNvbW1hbmQoZWxlbWVudHMsICdpbnZhbGlkIGVsZW1lbnRzJywgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB2YXIgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xyXG4gICAgICAgICAgaWYgKGVsZW1lbnRzKSB7XHJcbiAgICAgICAgICAgIHZhciByZXN1bHQgPSBlbnYubGluayhlbGVtZW50cyk7XHJcbiAgICAgICAgICAgIGVudi5FTEVNRU5UUyA9IHJlc3VsdDtcclxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdFxyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgZW52LkVMRU1FTlRTID0gbnVsbDtcclxuICAgICAgICAgIHJldHVybiBudWxsXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmVzdWx0LnZhbHVlID0gZWxlbWVudHM7XHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxyXG4gICAgICB9IGVsc2UgaWYgKFNfRUxFTUVOVFMgaW4gZHluYW1pY09wdGlvbnMpIHtcclxuICAgICAgICB2YXIgZHluID0gZHluYW1pY09wdGlvbnNbU19FTEVNRU5UU107XHJcbiAgICAgICAgcmV0dXJuIGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcclxuICAgICAgICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkO1xyXG5cclxuICAgICAgICAgIHZhciBJU19CVUZGRVJfQVJHUyA9IHNoYXJlZC5pc0J1ZmZlckFyZ3M7XHJcbiAgICAgICAgICB2YXIgRUxFTUVOVF9TVEFURSA9IHNoYXJlZC5lbGVtZW50cztcclxuXHJcbiAgICAgICAgICB2YXIgZWxlbWVudERlZm4gPSBlbnYuaW52b2tlKHNjb3BlLCBkeW4pO1xyXG4gICAgICAgICAgdmFyIGVsZW1lbnRzID0gc2NvcGUuZGVmKCdudWxsJyk7XHJcbiAgICAgICAgICB2YXIgZWxlbWVudFN0cmVhbSA9IHNjb3BlLmRlZihJU19CVUZGRVJfQVJHUywgJygnLCBlbGVtZW50RGVmbiwgJyknKTtcclxuXHJcbiAgICAgICAgICB2YXIgaWZ0ZSA9IGVudi5jb25kKGVsZW1lbnRTdHJlYW0pXHJcbiAgICAgICAgICAgIC50aGVuKGVsZW1lbnRzLCAnPScsIEVMRU1FTlRfU1RBVEUsICcuY3JlYXRlU3RyZWFtKCcsIGVsZW1lbnREZWZuLCAnKTsnKVxyXG4gICAgICAgICAgICAuZWxzZShlbGVtZW50cywgJz0nLCBFTEVNRU5UX1NUQVRFLCAnLmdldEVsZW1lbnRzKCcsIGVsZW1lbnREZWZuLCAnKTsnKTtcclxuXHJcbiAgICAgICAgICBjaGVjayQxLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgZW52LmFzc2VydChpZnRlLmVsc2UsXHJcbiAgICAgICAgICAgICAgJyEnICsgZWxlbWVudERlZm4gKyAnfHwnICsgZWxlbWVudHMsXHJcbiAgICAgICAgICAgICAgJ2ludmFsaWQgZWxlbWVudHMnKTtcclxuICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgIHNjb3BlLmVudHJ5KGlmdGUpO1xyXG4gICAgICAgICAgc2NvcGUuZXhpdChcclxuICAgICAgICAgICAgZW52LmNvbmQoZWxlbWVudFN0cmVhbSlcclxuICAgICAgICAgICAgICAudGhlbihFTEVNRU5UX1NUQVRFLCAnLmRlc3Ryb3lTdHJlYW0oJywgZWxlbWVudHMsICcpOycpKTtcclxuXHJcbiAgICAgICAgICBlbnYuRUxFTUVOVFMgPSBlbGVtZW50cztcclxuXHJcbiAgICAgICAgICByZXR1cm4gZWxlbWVudHNcclxuICAgICAgICB9KVxyXG4gICAgICB9XHJcblxyXG4gICAgICByZXR1cm4gbnVsbFxyXG4gICAgfVxyXG5cclxuICAgIHZhciBlbGVtZW50cyA9IHBhcnNlRWxlbWVudHMoKTtcclxuXHJcbiAgICBmdW5jdGlvbiBwYXJzZVByaW1pdGl2ZSAoKSB7XHJcbiAgICAgIGlmIChTX1BSSU1JVElWRSBpbiBzdGF0aWNPcHRpb25zKSB7XHJcbiAgICAgICAgdmFyIHByaW1pdGl2ZSA9IHN0YXRpY09wdGlvbnNbU19QUklNSVRJVkVdO1xyXG4gICAgICAgIGNoZWNrJDEuY29tbWFuZFBhcmFtZXRlcihwcmltaXRpdmUsIHByaW1UeXBlcywgJ2ludmFsaWQgcHJpbWl0dmUnLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcclxuICAgICAgICAgIHJldHVybiBwcmltVHlwZXNbcHJpbWl0aXZlXVxyXG4gICAgICAgIH0pXHJcbiAgICAgIH0gZWxzZSBpZiAoU19QUklNSVRJVkUgaW4gZHluYW1pY09wdGlvbnMpIHtcclxuICAgICAgICB2YXIgZHluUHJpbWl0aXZlID0gZHluYW1pY09wdGlvbnNbU19QUklNSVRJVkVdO1xyXG4gICAgICAgIHJldHVybiBjcmVhdGVEeW5hbWljRGVjbChkeW5QcmltaXRpdmUsIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XHJcbiAgICAgICAgICB2YXIgUFJJTV9UWVBFUyA9IGVudi5jb25zdGFudHMucHJpbVR5cGVzO1xyXG4gICAgICAgICAgdmFyIHByaW0gPSBlbnYuaW52b2tlKHNjb3BlLCBkeW5QcmltaXRpdmUpO1xyXG4gICAgICAgICAgY2hlY2skMS5vcHRpb25hbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXHJcbiAgICAgICAgICAgICAgcHJpbSArICcgaW4gJyArIFBSSU1fVFlQRVMsXHJcbiAgICAgICAgICAgICAgJ2ludmFsaWQgcHJpbWl0aXZlLCBtdXN0IGJlIG9uZSBvZiAnICsgT2JqZWN0LmtleXMocHJpbVR5cGVzKSk7XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoUFJJTV9UWVBFUywgJ1snLCBwcmltLCAnXScpXHJcbiAgICAgICAgfSlcclxuICAgICAgfSBlbHNlIGlmIChlbGVtZW50cykge1xyXG4gICAgICAgIGlmIChpc1N0YXRpYyhlbGVtZW50cykpIHtcclxuICAgICAgICAgIGlmIChlbGVtZW50cy52YWx1ZSkge1xyXG4gICAgICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xyXG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoZW52LkVMRU1FTlRTLCAnLnByaW1UeXBlJylcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHJldHVybiBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICByZXR1cm4gR0xfVFJJQU5HTEVTJDFcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgcmV0dXJuIG5ldyBEZWNsYXJhdGlvbihcclxuICAgICAgICAgICAgZWxlbWVudHMudGhpc0RlcCxcclxuICAgICAgICAgICAgZWxlbWVudHMuY29udGV4dERlcCxcclxuICAgICAgICAgICAgZWxlbWVudHMucHJvcERlcCxcclxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcclxuICAgICAgICAgICAgICB2YXIgZWxlbWVudHMgPSBlbnYuRUxFTUVOVFM7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihlbGVtZW50cywgJz8nLCBlbGVtZW50cywgJy5wcmltVHlwZTonLCBHTF9UUklBTkdMRVMkMSlcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIG51bGxcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBwYXJzZVBhcmFtIChwYXJhbSwgaXNPZmZzZXQpIHtcclxuICAgICAgaWYgKHBhcmFtIGluIHN0YXRpY09wdGlvbnMpIHtcclxuICAgICAgICB2YXIgdmFsdWUgPSBzdGF0aWNPcHRpb25zW3BhcmFtXSB8IDA7XHJcbiAgICAgICAgY2hlY2skMS5jb21tYW5kKCFpc09mZnNldCB8fCB2YWx1ZSA+PSAwLCAnaW52YWxpZCAnICsgcGFyYW0sIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICByZXR1cm4gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xyXG4gICAgICAgICAgaWYgKGlzT2Zmc2V0KSB7XHJcbiAgICAgICAgICAgIGVudi5PRkZTRVQgPSB2YWx1ZTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIHJldHVybiB2YWx1ZVxyXG4gICAgICAgIH0pXHJcbiAgICAgIH0gZWxzZSBpZiAocGFyYW0gaW4gZHluYW1pY09wdGlvbnMpIHtcclxuICAgICAgICB2YXIgZHluVmFsdWUgPSBkeW5hbWljT3B0aW9uc1twYXJhbV07XHJcbiAgICAgICAgcmV0dXJuIGNyZWF0ZUR5bmFtaWNEZWNsKGR5blZhbHVlLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xyXG4gICAgICAgICAgdmFyIHJlc3VsdCA9IGVudi5pbnZva2Uoc2NvcGUsIGR5blZhbHVlKTtcclxuICAgICAgICAgIGlmIChpc09mZnNldCkge1xyXG4gICAgICAgICAgICBlbnYuT0ZGU0VUID0gcmVzdWx0O1xyXG4gICAgICAgICAgICBjaGVjayQxLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxyXG4gICAgICAgICAgICAgICAgcmVzdWx0ICsgJz49MCcsXHJcbiAgICAgICAgICAgICAgICAnaW52YWxpZCAnICsgcGFyYW0pO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIHJldHVybiByZXN1bHRcclxuICAgICAgICB9KVxyXG4gICAgICB9IGVsc2UgaWYgKGlzT2Zmc2V0ICYmIGVsZW1lbnRzKSB7XHJcbiAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcclxuICAgICAgICAgIGVudi5PRkZTRVQgPSAnMCc7XHJcbiAgICAgICAgICByZXR1cm4gMFxyXG4gICAgICAgIH0pXHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIG51bGxcclxuICAgIH1cclxuXHJcbiAgICB2YXIgT0ZGU0VUID0gcGFyc2VQYXJhbShTX09GRlNFVCwgdHJ1ZSk7XHJcblxyXG4gICAgZnVuY3Rpb24gcGFyc2VWZXJ0Q291bnQgKCkge1xyXG4gICAgICBpZiAoU19DT1VOVCBpbiBzdGF0aWNPcHRpb25zKSB7XHJcbiAgICAgICAgdmFyIGNvdW50ID0gc3RhdGljT3B0aW9uc1tTX0NPVU5UXSB8IDA7XHJcbiAgICAgICAgY2hlY2skMS5jb21tYW5kKFxyXG4gICAgICAgICAgdHlwZW9mIGNvdW50ID09PSAnbnVtYmVyJyAmJiBjb3VudCA+PSAwLCAnaW52YWxpZCB2ZXJ0ZXggY291bnQnLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgcmV0dXJuIGNvdW50XHJcbiAgICAgICAgfSlcclxuICAgICAgfSBlbHNlIGlmIChTX0NPVU5UIGluIGR5bmFtaWNPcHRpb25zKSB7XHJcbiAgICAgICAgdmFyIGR5bkNvdW50ID0gZHluYW1pY09wdGlvbnNbU19DT1VOVF07XHJcbiAgICAgICAgcmV0dXJuIGNyZWF0ZUR5bmFtaWNEZWNsKGR5bkNvdW50LCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xyXG4gICAgICAgICAgdmFyIHJlc3VsdCA9IGVudi5pbnZva2Uoc2NvcGUsIGR5bkNvdW50KTtcclxuICAgICAgICAgIGNoZWNrJDEub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxyXG4gICAgICAgICAgICAgICd0eXBlb2YgJyArIHJlc3VsdCArICc9PT1cIm51bWJlclwiJiYnICtcclxuICAgICAgICAgICAgICByZXN1bHQgKyAnPj0wJiYnICtcclxuICAgICAgICAgICAgICByZXN1bHQgKyAnPT09KCcgKyByZXN1bHQgKyAnfDApJyxcclxuICAgICAgICAgICAgICAnaW52YWxpZCB2ZXJ0ZXggY291bnQnKTtcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgcmV0dXJuIHJlc3VsdFxyXG4gICAgICAgIH0pXHJcbiAgICAgIH0gZWxzZSBpZiAoZWxlbWVudHMpIHtcclxuICAgICAgICBpZiAoaXNTdGF0aWMoZWxlbWVudHMpKSB7XHJcbiAgICAgICAgICBpZiAoZWxlbWVudHMpIHtcclxuICAgICAgICAgICAgaWYgKE9GRlNFVCkge1xyXG4gICAgICAgICAgICAgIHJldHVybiBuZXcgRGVjbGFyYXRpb24oXHJcbiAgICAgICAgICAgICAgICBPRkZTRVQudGhpc0RlcCxcclxuICAgICAgICAgICAgICAgIE9GRlNFVC5jb250ZXh0RGVwLFxyXG4gICAgICAgICAgICAgICAgT0ZGU0VULnByb3BEZXAsXHJcbiAgICAgICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xyXG4gICAgICAgICAgICAgICAgICB2YXIgcmVzdWx0ID0gc2NvcGUuZGVmKFxyXG4gICAgICAgICAgICAgICAgICAgIGVudi5FTEVNRU5UUywgJy52ZXJ0Q291bnQtJywgZW52Lk9GRlNFVCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICBjaGVjayQxLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgcmVzdWx0ICsgJz49MCcsXHJcbiAgICAgICAgICAgICAgICAgICAgICAnaW52YWxpZCB2ZXJ0ZXggb2Zmc2V0L2VsZW1lbnQgYnVmZmVyIHRvbyBzbWFsbCcpO1xyXG4gICAgICAgICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHRcclxuICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoZW52LkVMRU1FTlRTLCAnLnZlcnRDb3VudCcpXHJcbiAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdmFyIHJlc3VsdCA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgIHJldHVybiAtMVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgY2hlY2skMS5vcHRpb25hbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgcmVzdWx0Lk1JU1NJTkcgPSB0cnVlO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdFxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICB2YXIgdmFyaWFibGUgPSBuZXcgRGVjbGFyYXRpb24oXHJcbiAgICAgICAgICAgIGVsZW1lbnRzLnRoaXNEZXAgfHwgT0ZGU0VULnRoaXNEZXAsXHJcbiAgICAgICAgICAgIGVsZW1lbnRzLmNvbnRleHREZXAgfHwgT0ZGU0VULmNvbnRleHREZXAsXHJcbiAgICAgICAgICAgIGVsZW1lbnRzLnByb3BEZXAgfHwgT0ZGU0VULnByb3BEZXAsXHJcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XHJcbiAgICAgICAgICAgICAgdmFyIGVsZW1lbnRzID0gZW52LkVMRU1FTlRTO1xyXG4gICAgICAgICAgICAgIGlmIChlbnYuT0ZGU0VUKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKGVsZW1lbnRzLCAnPycsIGVsZW1lbnRzLCAnLnZlcnRDb3VudC0nLFxyXG4gICAgICAgICAgICAgICAgICBlbnYuT0ZGU0VULCAnOi0xJylcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLmRlZihlbGVtZW50cywgJz8nLCBlbGVtZW50cywgJy52ZXJ0Q291bnQ6LTEnKVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgIGNoZWNrJDEub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICB2YXJpYWJsZS5EWU5BTUlDID0gdHJ1ZTtcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgcmV0dXJuIHZhcmlhYmxlXHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBudWxsXHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgZWxlbWVudHM6IGVsZW1lbnRzLFxyXG4gICAgICBwcmltaXRpdmU6IHBhcnNlUHJpbWl0aXZlKCksXHJcbiAgICAgIGNvdW50OiBwYXJzZVZlcnRDb3VudCgpLFxyXG4gICAgICBpbnN0YW5jZXM6IHBhcnNlUGFyYW0oU19JTlNUQU5DRVMsIGZhbHNlKSxcclxuICAgICAgb2Zmc2V0OiBPRkZTRVRcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHBhcnNlR0xTdGF0ZSAob3B0aW9ucywgZW52KSB7XHJcbiAgICB2YXIgc3RhdGljT3B0aW9ucyA9IG9wdGlvbnMuc3RhdGljO1xyXG4gICAgdmFyIGR5bmFtaWNPcHRpb25zID0gb3B0aW9ucy5keW5hbWljO1xyXG5cclxuICAgIHZhciBTVEFURSA9IHt9O1xyXG5cclxuICAgIEdMX1NUQVRFX05BTUVTLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcclxuICAgICAgdmFyIHBhcmFtID0gcHJvcE5hbWUocHJvcCk7XHJcblxyXG4gICAgICBmdW5jdGlvbiBwYXJzZVBhcmFtIChwYXJzZVN0YXRpYywgcGFyc2VEeW5hbWljKSB7XHJcbiAgICAgICAgaWYgKHByb3AgaW4gc3RhdGljT3B0aW9ucykge1xyXG4gICAgICAgICAgdmFyIHZhbHVlID0gcGFyc2VTdGF0aWMoc3RhdGljT3B0aW9uc1twcm9wXSk7XHJcbiAgICAgICAgICBTVEFURVtwYXJhbV0gPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlXHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICB9IGVsc2UgaWYgKHByb3AgaW4gZHluYW1pY09wdGlvbnMpIHtcclxuICAgICAgICAgIHZhciBkeW4gPSBkeW5hbWljT3B0aW9uc1twcm9wXTtcclxuICAgICAgICAgIFNUQVRFW3BhcmFtXSA9IGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHBhcnNlRHluYW1pYyhlbnYsIHNjb3BlLCBlbnYuaW52b2tlKHNjb3BlLCBkeW4pKVxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICBzd2l0Y2ggKHByb3ApIHtcclxuICAgICAgICBjYXNlIFNfQ1VMTF9FTkFCTEU6XHJcbiAgICAgICAgY2FzZSBTX0JMRU5EX0VOQUJMRTpcclxuICAgICAgICBjYXNlIFNfRElUSEVSOlxyXG4gICAgICAgIGNhc2UgU19TVEVOQ0lMX0VOQUJMRTpcclxuICAgICAgICBjYXNlIFNfREVQVEhfRU5BQkxFOlxyXG4gICAgICAgIGNhc2UgU19TQ0lTU09SX0VOQUJMRTpcclxuICAgICAgICBjYXNlIFNfUE9MWUdPTl9PRkZTRVRfRU5BQkxFOlxyXG4gICAgICAgIGNhc2UgU19TQU1QTEVfQUxQSEE6XHJcbiAgICAgICAgY2FzZSBTX1NBTVBMRV9FTkFCTEU6XHJcbiAgICAgICAgY2FzZSBTX0RFUFRIX01BU0s6XHJcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcclxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kVHlwZSh2YWx1ZSwgJ2Jvb2xlYW4nLCBwcm9wLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcclxuICAgICAgICAgICAgICAgICAgJ3R5cGVvZiAnICsgdmFsdWUgKyAnPT09XCJib29sZWFuXCInLFxyXG4gICAgICAgICAgICAgICAgICAnaW52YWxpZCBmbGFnICcgKyBwcm9wLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlXHJcbiAgICAgICAgICAgIH0pXHJcblxyXG4gICAgICAgIGNhc2UgU19ERVBUSF9GVU5DOlxyXG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXHJcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZFBhcmFtZXRlcih2YWx1ZSwgY29tcGFyZUZ1bmNzLCAnaW52YWxpZCAnICsgcHJvcCwgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgIHJldHVybiBjb21wYXJlRnVuY3NbdmFsdWVdXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xyXG4gICAgICAgICAgICAgIHZhciBDT01QQVJFX0ZVTkNTID0gZW52LmNvbnN0YW50cy5jb21wYXJlRnVuY3M7XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5vcHRpb25hbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxyXG4gICAgICAgICAgICAgICAgICB2YWx1ZSArICcgaW4gJyArIENPTVBBUkVfRlVOQ1MsXHJcbiAgICAgICAgICAgICAgICAgICdpbnZhbGlkICcgKyBwcm9wICsgJywgbXVzdCBiZSBvbmUgb2YgJyArIE9iamVjdC5rZXlzKGNvbXBhcmVGdW5jcykpO1xyXG4gICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoQ09NUEFSRV9GVU5DUywgJ1snLCB2YWx1ZSwgJ10nKVxyXG4gICAgICAgICAgICB9KVxyXG5cclxuICAgICAgICBjYXNlIFNfREVQVEhfUkFOR0U6XHJcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcclxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kKFxyXG4gICAgICAgICAgICAgICAgaXNBcnJheUxpa2UodmFsdWUpICYmXHJcbiAgICAgICAgICAgICAgICB2YWx1ZS5sZW5ndGggPT09IDIgJiZcclxuICAgICAgICAgICAgICAgIHR5cGVvZiB2YWx1ZVswXSA9PT0gJ251bWJlcicgJiZcclxuICAgICAgICAgICAgICAgIHR5cGVvZiB2YWx1ZVsxXSA9PT0gJ251bWJlcicgJiZcclxuICAgICAgICAgICAgICAgIHZhbHVlWzBdIDw9IHZhbHVlWzFdLFxyXG4gICAgICAgICAgICAgICAgJ2RlcHRoIHJhbmdlIGlzIDJkIGFycmF5JyxcclxuICAgICAgICAgICAgICAgIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWVcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5vcHRpb25hbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxyXG4gICAgICAgICAgICAgICAgICBlbnYuc2hhcmVkLmlzQXJyYXlMaWtlICsgJygnICsgdmFsdWUgKyAnKSYmJyArXHJcbiAgICAgICAgICAgICAgICAgIHZhbHVlICsgJy5sZW5ndGg9PT0yJiYnICtcclxuICAgICAgICAgICAgICAgICAgJ3R5cGVvZiAnICsgdmFsdWUgKyAnWzBdPT09XCJudW1iZXJcIiYmJyArXHJcbiAgICAgICAgICAgICAgICAgICd0eXBlb2YgJyArIHZhbHVlICsgJ1sxXT09PVwibnVtYmVyXCImJicgK1xyXG4gICAgICAgICAgICAgICAgICB2YWx1ZSArICdbMF08PScgKyB2YWx1ZSArICdbMV0nLFxyXG4gICAgICAgICAgICAgICAgICAnZGVwdGggcmFuZ2UgbXVzdCBiZSBhIDJkIGFycmF5Jyk7XHJcbiAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgIHZhciBaX05FQVIgPSBzY29wZS5kZWYoJysnLCB2YWx1ZSwgJ1swXScpO1xyXG4gICAgICAgICAgICAgIHZhciBaX0ZBUiA9IHNjb3BlLmRlZignKycsIHZhbHVlLCAnWzFdJyk7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIFtaX05FQVIsIFpfRkFSXVxyXG4gICAgICAgICAgICB9KVxyXG5cclxuICAgICAgICBjYXNlIFNfQkxFTkRfRlVOQzpcclxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxyXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcclxuICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmRUeXBlKHZhbHVlLCAnb2JqZWN0JywgJ2JsZW5kLmZ1bmMnLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgICAgdmFyIHNyY1JHQiA9ICgnc3JjUkdCJyBpbiB2YWx1ZSA/IHZhbHVlLnNyY1JHQiA6IHZhbHVlLnNyYyk7XHJcbiAgICAgICAgICAgICAgdmFyIHNyY0FscGhhID0gKCdzcmNBbHBoYScgaW4gdmFsdWUgPyB2YWx1ZS5zcmNBbHBoYSA6IHZhbHVlLnNyYyk7XHJcbiAgICAgICAgICAgICAgdmFyIGRzdFJHQiA9ICgnZHN0UkdCJyBpbiB2YWx1ZSA/IHZhbHVlLmRzdFJHQiA6IHZhbHVlLmRzdCk7XHJcbiAgICAgICAgICAgICAgdmFyIGRzdEFscGhhID0gKCdkc3RBbHBoYScgaW4gdmFsdWUgPyB2YWx1ZS5kc3RBbHBoYSA6IHZhbHVlLmRzdCk7XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kUGFyYW1ldGVyKHNyY1JHQiwgYmxlbmRGdW5jcywgcGFyYW0gKyAnLnNyY1JHQicsIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmRQYXJhbWV0ZXIoc3JjQWxwaGEsIGJsZW5kRnVuY3MsIHBhcmFtICsgJy5zcmNBbHBoYScsIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmRQYXJhbWV0ZXIoZHN0UkdCLCBibGVuZEZ1bmNzLCBwYXJhbSArICcuZHN0UkdCJywgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZFBhcmFtZXRlcihkc3RBbHBoYSwgYmxlbmRGdW5jcywgcGFyYW0gKyAnLmRzdEFscGhhJywgZW52LmNvbW1hbmRTdHIpO1xyXG5cclxuICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmQoXHJcbiAgICAgICAgICAgICAgICAoaW52YWxpZEJsZW5kQ29tYmluYXRpb25zLmluZGV4T2Yoc3JjUkdCICsgJywgJyArIGRzdFJHQikgPT09IC0xKSxcclxuICAgICAgICAgICAgICAgICd1bmFsbG93ZWQgYmxlbmRpbmcgY29tYmluYXRpb24gKHNyY1JHQiwgZHN0UkdCKSA9ICgnICsgc3JjUkdCICsgJywgJyArIGRzdFJHQiArICcpJywgZW52LmNvbW1hbmRTdHIpO1xyXG5cclxuICAgICAgICAgICAgICByZXR1cm4gW1xyXG4gICAgICAgICAgICAgICAgYmxlbmRGdW5jc1tzcmNSR0JdLFxyXG4gICAgICAgICAgICAgICAgYmxlbmRGdW5jc1tkc3RSR0JdLFxyXG4gICAgICAgICAgICAgICAgYmxlbmRGdW5jc1tzcmNBbHBoYV0sXHJcbiAgICAgICAgICAgICAgICBibGVuZEZ1bmNzW2RzdEFscGhhXVxyXG4gICAgICAgICAgICAgIF1cclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgdmFyIEJMRU5EX0ZVTkNTID0gZW52LmNvbnN0YW50cy5ibGVuZEZ1bmNzO1xyXG5cclxuICAgICAgICAgICAgICBjaGVjayQxLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXHJcbiAgICAgICAgICAgICAgICAgIHZhbHVlICsgJyYmdHlwZW9mICcgKyB2YWx1ZSArICc9PT1cIm9iamVjdFwiJyxcclxuICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgYmxlbmQgZnVuYywgbXVzdCBiZSBhbiBvYmplY3QnKTtcclxuICAgICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgICAgZnVuY3Rpb24gcmVhZCAocHJlZml4LCBzdWZmaXgpIHtcclxuICAgICAgICAgICAgICAgIHZhciBmdW5jID0gc2NvcGUuZGVmKFxyXG4gICAgICAgICAgICAgICAgICAnXCInLCBwcmVmaXgsIHN1ZmZpeCwgJ1wiIGluICcsIHZhbHVlLFxyXG4gICAgICAgICAgICAgICAgICAnPycsIHZhbHVlLCAnLicsIHByZWZpeCwgc3VmZml4LFxyXG4gICAgICAgICAgICAgICAgICAnOicsIHZhbHVlLCAnLicsIHByZWZpeCk7XHJcblxyXG4gICAgICAgICAgICAgICAgY2hlY2skMS5vcHRpb25hbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXHJcbiAgICAgICAgICAgICAgICAgICAgZnVuYyArICcgaW4gJyArIEJMRU5EX0ZVTkNTLFxyXG4gICAgICAgICAgICAgICAgICAgICdpbnZhbGlkICcgKyBwcm9wICsgJy4nICsgcHJlZml4ICsgc3VmZml4ICsgJywgbXVzdCBiZSBvbmUgb2YgJyArIE9iamVjdC5rZXlzKGJsZW5kRnVuY3MpKTtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgIHJldHVybiBmdW5jXHJcbiAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICB2YXIgc3JjUkdCID0gcmVhZCgnc3JjJywgJ1JHQicpO1xyXG4gICAgICAgICAgICAgIHZhciBkc3RSR0IgPSByZWFkKCdkc3QnLCAnUkdCJyk7XHJcblxyXG4gICAgICAgICAgICAgIGNoZWNrJDEub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgdmFyIElOVkFMSURfQkxFTkRfQ09NQklOQVRJT05TID0gZW52LmNvbnN0YW50cy5pbnZhbGlkQmxlbmRDb21iaW5hdGlvbnM7XHJcblxyXG4gICAgICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgSU5WQUxJRF9CTEVORF9DT01CSU5BVElPTlMgK1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAnLmluZGV4T2YoJyArIHNyY1JHQiArICcrXCIsIFwiKycgKyBkc3RSR0IgKyAnKSA9PT0gLTEgJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgJ3VuYWxsb3dlZCBibGVuZGluZyBjb21iaW5hdGlvbiBmb3IgKHNyY1JHQiwgZHN0UkdCKSdcclxuICAgICAgICAgICAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICB2YXIgU1JDX1JHQiA9IHNjb3BlLmRlZihCTEVORF9GVU5DUywgJ1snLCBzcmNSR0IsICddJyk7XHJcbiAgICAgICAgICAgICAgdmFyIFNSQ19BTFBIQSA9IHNjb3BlLmRlZihCTEVORF9GVU5DUywgJ1snLCByZWFkKCdzcmMnLCAnQWxwaGEnKSwgJ10nKTtcclxuICAgICAgICAgICAgICB2YXIgRFNUX1JHQiA9IHNjb3BlLmRlZihCTEVORF9GVU5DUywgJ1snLCBkc3RSR0IsICddJyk7XHJcbiAgICAgICAgICAgICAgdmFyIERTVF9BTFBIQSA9IHNjb3BlLmRlZihCTEVORF9GVU5DUywgJ1snLCByZWFkKCdkc3QnLCAnQWxwaGEnKSwgJ10nKTtcclxuXHJcbiAgICAgICAgICAgICAgcmV0dXJuIFtTUkNfUkdCLCBEU1RfUkdCLCBTUkNfQUxQSEEsIERTVF9BTFBIQV1cclxuICAgICAgICAgICAgfSlcclxuXHJcbiAgICAgICAgY2FzZSBTX0JMRU5EX0VRVUFUSU9OOlxyXG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXHJcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xyXG4gICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XHJcbiAgICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmRQYXJhbWV0ZXIodmFsdWUsIGJsZW5kRXF1YXRpb25zLCAnaW52YWxpZCAnICsgcHJvcCwgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIFtcclxuICAgICAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWVdLFxyXG4gICAgICAgICAgICAgICAgICBibGVuZEVxdWF0aW9uc1t2YWx1ZV1cclxuICAgICAgICAgICAgICAgIF1cclxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcclxuICAgICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZFBhcmFtZXRlcihcclxuICAgICAgICAgICAgICAgICAgdmFsdWUucmdiLCBibGVuZEVxdWF0aW9ucywgcHJvcCArICcucmdiJywgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kUGFyYW1ldGVyKFxyXG4gICAgICAgICAgICAgICAgICB2YWx1ZS5hbHBoYSwgYmxlbmRFcXVhdGlvbnMsIHByb3AgKyAnLmFscGhhJywgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIFtcclxuICAgICAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWUucmdiXSxcclxuICAgICAgICAgICAgICAgICAgYmxlbmRFcXVhdGlvbnNbdmFsdWUuYWxwaGFdXHJcbiAgICAgICAgICAgICAgICBdXHJcbiAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZFJhaXNlKCdpbnZhbGlkIGJsZW5kLmVxdWF0aW9uJywgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgdmFyIEJMRU5EX0VRVUFUSU9OUyA9IGVudi5jb25zdGFudHMuYmxlbmRFcXVhdGlvbnM7XHJcblxyXG4gICAgICAgICAgICAgIHZhciBSR0IgPSBzY29wZS5kZWYoKTtcclxuICAgICAgICAgICAgICB2YXIgQUxQSEEgPSBzY29wZS5kZWYoKTtcclxuXHJcbiAgICAgICAgICAgICAgdmFyIGlmdGUgPSBlbnYuY29uZCgndHlwZW9mICcsIHZhbHVlLCAnPT09XCJzdHJpbmdcIicpO1xyXG5cclxuICAgICAgICAgICAgICBjaGVjayQxLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGNoZWNrUHJvcCAoYmxvY2ssIG5hbWUsIHZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoYmxvY2ssXHJcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgKyAnIGluICcgKyBCTEVORF9FUVVBVElPTlMsXHJcbiAgICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgJyArIG5hbWUgKyAnLCBtdXN0IGJlIG9uZSBvZiAnICsgT2JqZWN0LmtleXMoYmxlbmRFcXVhdGlvbnMpKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNoZWNrUHJvcChpZnRlLnRoZW4sIHByb3AsIHZhbHVlKTtcclxuXHJcbiAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KGlmdGUuZWxzZSxcclxuICAgICAgICAgICAgICAgICAgdmFsdWUgKyAnJiZ0eXBlb2YgJyArIHZhbHVlICsgJz09PVwib2JqZWN0XCInLFxyXG4gICAgICAgICAgICAgICAgICAnaW52YWxpZCAnICsgcHJvcCk7XHJcbiAgICAgICAgICAgICAgICBjaGVja1Byb3AoaWZ0ZS5lbHNlLCBwcm9wICsgJy5yZ2InLCB2YWx1ZSArICcucmdiJyk7XHJcbiAgICAgICAgICAgICAgICBjaGVja1Byb3AoaWZ0ZS5lbHNlLCBwcm9wICsgJy5hbHBoYScsIHZhbHVlICsgJy5hbHBoYScpO1xyXG4gICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICBpZnRlLnRoZW4oXHJcbiAgICAgICAgICAgICAgICBSR0IsICc9JywgQUxQSEEsICc9JywgQkxFTkRfRVFVQVRJT05TLCAnWycsIHZhbHVlLCAnXTsnKTtcclxuICAgICAgICAgICAgICBpZnRlLmVsc2UoXHJcbiAgICAgICAgICAgICAgICBSR0IsICc9JywgQkxFTkRfRVFVQVRJT05TLCAnWycsIHZhbHVlLCAnLnJnYl07JyxcclxuICAgICAgICAgICAgICAgIEFMUEhBLCAnPScsIEJMRU5EX0VRVUFUSU9OUywgJ1snLCB2YWx1ZSwgJy5hbHBoYV07Jyk7XHJcblxyXG4gICAgICAgICAgICAgIHNjb3BlKGlmdGUpO1xyXG5cclxuICAgICAgICAgICAgICByZXR1cm4gW1JHQiwgQUxQSEFdXHJcbiAgICAgICAgICAgIH0pXHJcblxyXG4gICAgICAgIGNhc2UgU19CTEVORF9DT0xPUjpcclxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxyXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcclxuICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmQoXHJcbiAgICAgICAgICAgICAgICBpc0FycmF5TGlrZSh2YWx1ZSkgJiZcclxuICAgICAgICAgICAgICAgIHZhbHVlLmxlbmd0aCA9PT0gNCxcclxuICAgICAgICAgICAgICAgICdibGVuZC5jb2xvciBtdXN0IGJlIGEgNGQgYXJyYXknLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIGxvb3AoNCwgZnVuY3Rpb24gKGkpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiArdmFsdWVbaV1cclxuICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcclxuICAgICAgICAgICAgICBjaGVjayQxLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXHJcbiAgICAgICAgICAgICAgICAgIGVudi5zaGFyZWQuaXNBcnJheUxpa2UgKyAnKCcgKyB2YWx1ZSArICcpJiYnICtcclxuICAgICAgICAgICAgICAgICAgdmFsdWUgKyAnLmxlbmd0aD09PTQnLFxyXG4gICAgICAgICAgICAgICAgICAnYmxlbmQuY29sb3IgbXVzdCBiZSBhIDRkIGFycmF5Jyk7XHJcbiAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIGxvb3AoNCwgZnVuY3Rpb24gKGkpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoJysnLCB2YWx1ZSwgJ1snLCBpLCAnXScpXHJcbiAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgfSlcclxuXHJcbiAgICAgICAgY2FzZSBTX1NURU5DSUxfTUFTSzpcclxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxyXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcclxuICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmRUeXBlKHZhbHVlLCAnbnVtYmVyJywgcGFyYW0sIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgICByZXR1cm4gdmFsdWUgfCAwXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcclxuICAgICAgICAgICAgICAgICAgJ3R5cGVvZiAnICsgdmFsdWUgKyAnPT09XCJudW1iZXJcIicsXHJcbiAgICAgICAgICAgICAgICAgICdpbnZhbGlkIHN0ZW5jaWwubWFzaycpO1xyXG4gICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYodmFsdWUsICd8MCcpXHJcbiAgICAgICAgICAgIH0pXHJcblxyXG4gICAgICAgIGNhc2UgU19TVEVOQ0lMX0ZVTkM6XHJcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcclxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kVHlwZSh2YWx1ZSwgJ29iamVjdCcsIHBhcmFtLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgICAgdmFyIGNtcCA9IHZhbHVlLmNtcCB8fCAna2VlcCc7XHJcbiAgICAgICAgICAgICAgdmFyIHJlZiA9IHZhbHVlLnJlZiB8fCAwO1xyXG4gICAgICAgICAgICAgIHZhciBtYXNrID0gJ21hc2snIGluIHZhbHVlID8gdmFsdWUubWFzayA6IC0xO1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZFBhcmFtZXRlcihjbXAsIGNvbXBhcmVGdW5jcywgcHJvcCArICcuY21wJywgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZFR5cGUocmVmLCAnbnVtYmVyJywgcHJvcCArICcucmVmJywgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZFR5cGUobWFzaywgJ251bWJlcicsIHByb3AgKyAnLm1hc2snLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIFtcclxuICAgICAgICAgICAgICAgIGNvbXBhcmVGdW5jc1tjbXBdLFxyXG4gICAgICAgICAgICAgICAgcmVmLFxyXG4gICAgICAgICAgICAgICAgbWFza1xyXG4gICAgICAgICAgICAgIF1cclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgZnVuY3Rpb24gKGVudiwgc2NvcGUsIHZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgdmFyIENPTVBBUkVfRlVOQ1MgPSBlbnYuY29uc3RhbnRzLmNvbXBhcmVGdW5jcztcclxuICAgICAgICAgICAgICBjaGVjayQxLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGFzc2VydCAoKSB7XHJcbiAgICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXHJcbiAgICAgICAgICAgICAgICAgICAgQXJyYXkucHJvdG90eXBlLmpvaW4uY2FsbChhcmd1bWVudHMsICcnKSxcclxuICAgICAgICAgICAgICAgICAgICAnaW52YWxpZCBzdGVuY2lsLmZ1bmMnKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGFzc2VydCh2YWx1ZSArICcmJnR5cGVvZiAnLCB2YWx1ZSwgJz09PVwib2JqZWN0XCInKTtcclxuICAgICAgICAgICAgICAgIGFzc2VydCgnIShcImNtcFwiIGluICcsIHZhbHVlLCAnKXx8KCcsXHJcbiAgICAgICAgICAgICAgICAgIHZhbHVlLCAnLmNtcCBpbiAnLCBDT01QQVJFX0ZVTkNTLCAnKScpO1xyXG4gICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgIHZhciBjbXAgPSBzY29wZS5kZWYoXHJcbiAgICAgICAgICAgICAgICAnXCJjbXBcIiBpbiAnLCB2YWx1ZSxcclxuICAgICAgICAgICAgICAgICc/JywgQ09NUEFSRV9GVU5DUywgJ1snLCB2YWx1ZSwgJy5jbXBdJyxcclxuICAgICAgICAgICAgICAgICc6JywgR0xfS0VFUCk7XHJcbiAgICAgICAgICAgICAgdmFyIHJlZiA9IHNjb3BlLmRlZih2YWx1ZSwgJy5yZWZ8MCcpO1xyXG4gICAgICAgICAgICAgIHZhciBtYXNrID0gc2NvcGUuZGVmKFxyXG4gICAgICAgICAgICAgICAgJ1wibWFza1wiIGluICcsIHZhbHVlLFxyXG4gICAgICAgICAgICAgICAgJz8nLCB2YWx1ZSwgJy5tYXNrfDA6LTEnKTtcclxuICAgICAgICAgICAgICByZXR1cm4gW2NtcCwgcmVmLCBtYXNrXVxyXG4gICAgICAgICAgICB9KVxyXG5cclxuICAgICAgICBjYXNlIFNfU1RFTkNJTF9PUEZST05UOlxyXG4gICAgICAgIGNhc2UgU19TVEVOQ0lMX09QQkFDSzpcclxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxyXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcclxuICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmRUeXBlKHZhbHVlLCAnb2JqZWN0JywgcGFyYW0sIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgICB2YXIgZmFpbCA9IHZhbHVlLmZhaWwgfHwgJ2tlZXAnO1xyXG4gICAgICAgICAgICAgIHZhciB6ZmFpbCA9IHZhbHVlLnpmYWlsIHx8ICdrZWVwJztcclxuICAgICAgICAgICAgICB2YXIgenBhc3MgPSB2YWx1ZS56cGFzcyB8fCAna2VlcCc7XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kUGFyYW1ldGVyKGZhaWwsIHN0ZW5jaWxPcHMsIHByb3AgKyAnLmZhaWwnLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kUGFyYW1ldGVyKHpmYWlsLCBzdGVuY2lsT3BzLCBwcm9wICsgJy56ZmFpbCcsIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmRQYXJhbWV0ZXIoenBhc3MsIHN0ZW5jaWxPcHMsIHByb3AgKyAnLnpwYXNzJywgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgIHJldHVybiBbXHJcbiAgICAgICAgICAgICAgICBwcm9wID09PSBTX1NURU5DSUxfT1BCQUNLID8gR0xfQkFDSyA6IEdMX0ZST05ULFxyXG4gICAgICAgICAgICAgICAgc3RlbmNpbE9wc1tmYWlsXSxcclxuICAgICAgICAgICAgICAgIHN0ZW5jaWxPcHNbemZhaWxdLFxyXG4gICAgICAgICAgICAgICAgc3RlbmNpbE9wc1t6cGFzc11cclxuICAgICAgICAgICAgICBdXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xyXG4gICAgICAgICAgICAgIHZhciBTVEVOQ0lMX09QUyA9IGVudi5jb25zdGFudHMuc3RlbmNpbE9wcztcclxuXHJcbiAgICAgICAgICAgICAgY2hlY2skMS5vcHRpb25hbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxyXG4gICAgICAgICAgICAgICAgICB2YWx1ZSArICcmJnR5cGVvZiAnICsgdmFsdWUgKyAnPT09XCJvYmplY3RcIicsXHJcbiAgICAgICAgICAgICAgICAgICdpbnZhbGlkICcgKyBwcm9wKTtcclxuICAgICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgICAgZnVuY3Rpb24gcmVhZCAobmFtZSkge1xyXG4gICAgICAgICAgICAgICAgY2hlY2skMS5vcHRpb25hbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXHJcbiAgICAgICAgICAgICAgICAgICAgJyEoXCInICsgbmFtZSArICdcIiBpbiAnICsgdmFsdWUgKyAnKXx8JyArXHJcbiAgICAgICAgICAgICAgICAgICAgJygnICsgdmFsdWUgKyAnLicgKyBuYW1lICsgJyBpbiAnICsgU1RFTkNJTF9PUFMgKyAnKScsXHJcbiAgICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgJyArIHByb3AgKyAnLicgKyBuYW1lICsgJywgbXVzdCBiZSBvbmUgb2YgJyArIE9iamVjdC5rZXlzKHN0ZW5jaWxPcHMpKTtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYoXHJcbiAgICAgICAgICAgICAgICAgICdcIicsIG5hbWUsICdcIiBpbiAnLCB2YWx1ZSxcclxuICAgICAgICAgICAgICAgICAgJz8nLCBTVEVOQ0lMX09QUywgJ1snLCB2YWx1ZSwgJy4nLCBuYW1lLCAnXTonLFxyXG4gICAgICAgICAgICAgICAgICBHTF9LRUVQKVxyXG4gICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgcmV0dXJuIFtcclxuICAgICAgICAgICAgICAgIHByb3AgPT09IFNfU1RFTkNJTF9PUEJBQ0sgPyBHTF9CQUNLIDogR0xfRlJPTlQsXHJcbiAgICAgICAgICAgICAgICByZWFkKCdmYWlsJyksXHJcbiAgICAgICAgICAgICAgICByZWFkKCd6ZmFpbCcpLFxyXG4gICAgICAgICAgICAgICAgcmVhZCgnenBhc3MnKVxyXG4gICAgICAgICAgICAgIF1cclxuICAgICAgICAgICAgfSlcclxuXHJcbiAgICAgICAgY2FzZSBTX1BPTFlHT05fT0ZGU0VUX09GRlNFVDpcclxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxyXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcclxuICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmRUeXBlKHZhbHVlLCAnb2JqZWN0JywgcGFyYW0sIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgICB2YXIgZmFjdG9yID0gdmFsdWUuZmFjdG9yIHwgMDtcclxuICAgICAgICAgICAgICB2YXIgdW5pdHMgPSB2YWx1ZS51bml0cyB8IDA7XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kVHlwZShmYWN0b3IsICdudW1iZXInLCBwYXJhbSArICcuZmFjdG9yJywgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZFR5cGUodW5pdHMsICdudW1iZXInLCBwYXJhbSArICcudW5pdHMnLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIFtmYWN0b3IsIHVuaXRzXVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcclxuICAgICAgICAgICAgICBjaGVjayQxLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXHJcbiAgICAgICAgICAgICAgICAgIHZhbHVlICsgJyYmdHlwZW9mICcgKyB2YWx1ZSArICc9PT1cIm9iamVjdFwiJyxcclxuICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgJyArIHByb3ApO1xyXG4gICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICB2YXIgRkFDVE9SID0gc2NvcGUuZGVmKHZhbHVlLCAnLmZhY3RvcnwwJyk7XHJcbiAgICAgICAgICAgICAgdmFyIFVOSVRTID0gc2NvcGUuZGVmKHZhbHVlLCAnLnVuaXRzfDAnKTtcclxuXHJcbiAgICAgICAgICAgICAgcmV0dXJuIFtGQUNUT1IsIFVOSVRTXVxyXG4gICAgICAgICAgICB9KVxyXG5cclxuICAgICAgICBjYXNlIFNfQ1VMTF9GQUNFOlxyXG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXHJcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xyXG4gICAgICAgICAgICAgIHZhciBmYWNlID0gMDtcclxuICAgICAgICAgICAgICBpZiAodmFsdWUgPT09ICdmcm9udCcpIHtcclxuICAgICAgICAgICAgICAgIGZhY2UgPSBHTF9GUk9OVDtcclxuICAgICAgICAgICAgICB9IGVsc2UgaWYgKHZhbHVlID09PSAnYmFjaycpIHtcclxuICAgICAgICAgICAgICAgIGZhY2UgPSBHTF9CQUNLO1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmQoISFmYWNlLCBwYXJhbSwgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgIHJldHVybiBmYWNlXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcclxuICAgICAgICAgICAgICAgICAgdmFsdWUgKyAnPT09XCJmcm9udFwifHwnICtcclxuICAgICAgICAgICAgICAgICAgdmFsdWUgKyAnPT09XCJiYWNrXCInLFxyXG4gICAgICAgICAgICAgICAgICAnaW52YWxpZCBjdWxsLmZhY2UnKTtcclxuICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICByZXR1cm4gc2NvcGUuZGVmKHZhbHVlLCAnPT09XCJmcm9udFwiPycsIEdMX0ZST05ULCAnOicsIEdMX0JBQ0spXHJcbiAgICAgICAgICAgIH0pXHJcblxyXG4gICAgICAgIGNhc2UgU19MSU5FX1dJRFRIOlxyXG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXHJcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZChcclxuICAgICAgICAgICAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgJiZcclxuICAgICAgICAgICAgICAgIHZhbHVlID49IGxpbWl0cy5saW5lV2lkdGhEaW1zWzBdICYmXHJcbiAgICAgICAgICAgICAgICB2YWx1ZSA8PSBsaW1pdHMubGluZVdpZHRoRGltc1sxXSxcclxuICAgICAgICAgICAgICAgICdpbnZhbGlkIGxpbmUgd2lkdGgsIG11c3QgYmUgYSBwb3NpdGl2ZSBudW1iZXIgYmV0d2VlbiAnICtcclxuICAgICAgICAgICAgICAgIGxpbWl0cy5saW5lV2lkdGhEaW1zWzBdICsgJyBhbmQgJyArIGxpbWl0cy5saW5lV2lkdGhEaW1zWzFdLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcclxuICAgICAgICAgICAgICAgICAgJ3R5cGVvZiAnICsgdmFsdWUgKyAnPT09XCJudW1iZXJcIiYmJyArXHJcbiAgICAgICAgICAgICAgICAgIHZhbHVlICsgJz49JyArIGxpbWl0cy5saW5lV2lkdGhEaW1zWzBdICsgJyYmJyArXHJcbiAgICAgICAgICAgICAgICAgIHZhbHVlICsgJzw9JyArIGxpbWl0cy5saW5lV2lkdGhEaW1zWzFdLFxyXG4gICAgICAgICAgICAgICAgICAnaW52YWxpZCBsaW5lIHdpZHRoJyk7XHJcbiAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZVxyXG4gICAgICAgICAgICB9KVxyXG5cclxuICAgICAgICBjYXNlIFNfRlJPTlRfRkFDRTpcclxuICAgICAgICAgIHJldHVybiBwYXJzZVBhcmFtKFxyXG4gICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcclxuICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmRQYXJhbWV0ZXIodmFsdWUsIG9yaWVudGF0aW9uVHlwZSwgcGFyYW0sIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgICByZXR1cm4gb3JpZW50YXRpb25UeXBlW3ZhbHVlXVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcclxuICAgICAgICAgICAgICBjaGVjayQxLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXHJcbiAgICAgICAgICAgICAgICAgIHZhbHVlICsgJz09PVwiY3dcInx8JyArXHJcbiAgICAgICAgICAgICAgICAgIHZhbHVlICsgJz09PVwiY2N3XCInLFxyXG4gICAgICAgICAgICAgICAgICAnaW52YWxpZCBmcm9udEZhY2UsIG11c3QgYmUgb25lIG9mIGN3LGNjdycpO1xyXG4gICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgIHJldHVybiBzY29wZS5kZWYodmFsdWUgKyAnPT09XCJjd1wiPycgKyBHTF9DVyArICc6JyArIEdMX0NDVylcclxuICAgICAgICAgICAgfSlcclxuXHJcbiAgICAgICAgY2FzZSBTX0NPTE9SX01BU0s6XHJcbiAgICAgICAgICByZXR1cm4gcGFyc2VQYXJhbShcclxuICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kKFxyXG4gICAgICAgICAgICAgICAgaXNBcnJheUxpa2UodmFsdWUpICYmIHZhbHVlLmxlbmd0aCA9PT0gNCxcclxuICAgICAgICAgICAgICAgICdjb2xvci5tYXNrIG11c3QgYmUgbGVuZ3RoIDQgYXJyYXknLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlLm1hcChmdW5jdGlvbiAodikgeyByZXR1cm4gISF2IH0pXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlbnYsIHNjb3BlLCB2YWx1ZSkge1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSxcclxuICAgICAgICAgICAgICAgICAgZW52LnNoYXJlZC5pc0FycmF5TGlrZSArICcoJyArIHZhbHVlICsgJykmJicgK1xyXG4gICAgICAgICAgICAgICAgICB2YWx1ZSArICcubGVuZ3RoPT09NCcsXHJcbiAgICAgICAgICAgICAgICAgICdpbnZhbGlkIGNvbG9yLm1hc2snKTtcclxuICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICByZXR1cm4gbG9vcCg0LCBmdW5jdGlvbiAoaSkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuICchIScgKyB2YWx1ZSArICdbJyArIGkgKyAnXSdcclxuICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICB9KVxyXG5cclxuICAgICAgICBjYXNlIFNfU0FNUExFX0NPVkVSQUdFOlxyXG4gICAgICAgICAgcmV0dXJuIHBhcnNlUGFyYW0oXHJcbiAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZCh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlLCBwYXJhbSwgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgIHZhciBzYW1wbGVWYWx1ZSA9ICd2YWx1ZScgaW4gdmFsdWUgPyB2YWx1ZS52YWx1ZSA6IDE7XHJcbiAgICAgICAgICAgICAgdmFyIHNhbXBsZUludmVydCA9ICEhdmFsdWUuaW52ZXJ0O1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZChcclxuICAgICAgICAgICAgICAgIHR5cGVvZiBzYW1wbGVWYWx1ZSA9PT0gJ251bWJlcicgJiZcclxuICAgICAgICAgICAgICAgIHNhbXBsZVZhbHVlID49IDAgJiYgc2FtcGxlVmFsdWUgPD0gMSxcclxuICAgICAgICAgICAgICAgICdzYW1wbGUuY292ZXJhZ2UudmFsdWUgbXVzdCBiZSBhIG51bWJlciBiZXR3ZWVuIDAgYW5kIDEnLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIFtzYW1wbGVWYWx1ZSwgc2FtcGxlSW52ZXJ0XVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBmdW5jdGlvbiAoZW52LCBzY29wZSwgdmFsdWUpIHtcclxuICAgICAgICAgICAgICBjaGVjayQxLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsXHJcbiAgICAgICAgICAgICAgICAgIHZhbHVlICsgJyYmdHlwZW9mICcgKyB2YWx1ZSArICc9PT1cIm9iamVjdFwiJyxcclxuICAgICAgICAgICAgICAgICAgJ2ludmFsaWQgc2FtcGxlLmNvdmVyYWdlJyk7XHJcbiAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgdmFyIFZBTFVFID0gc2NvcGUuZGVmKFxyXG4gICAgICAgICAgICAgICAgJ1widmFsdWVcIiBpbiAnLCB2YWx1ZSwgJz8rJywgdmFsdWUsICcudmFsdWU6MScpO1xyXG4gICAgICAgICAgICAgIHZhciBJTlZFUlQgPSBzY29wZS5kZWYoJyEhJywgdmFsdWUsICcuaW52ZXJ0Jyk7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIFtWQUxVRSwgSU5WRVJUXVxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICByZXR1cm4gU1RBVEVcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHBhcnNlVW5pZm9ybXMgKHVuaWZvcm1zLCBlbnYpIHtcclxuICAgIHZhciBzdGF0aWNVbmlmb3JtcyA9IHVuaWZvcm1zLnN0YXRpYztcclxuICAgIHZhciBkeW5hbWljVW5pZm9ybXMgPSB1bmlmb3Jtcy5keW5hbWljO1xyXG5cclxuICAgIHZhciBVTklGT1JNUyA9IHt9O1xyXG5cclxuICAgIE9iamVjdC5rZXlzKHN0YXRpY1VuaWZvcm1zKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XHJcbiAgICAgIHZhciB2YWx1ZSA9IHN0YXRpY1VuaWZvcm1zW25hbWVdO1xyXG4gICAgICB2YXIgcmVzdWx0O1xyXG4gICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyB8fFxyXG4gICAgICAgICAgdHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHtcclxuICAgICAgICByZXN1bHQgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgIHJldHVybiB2YWx1ZVxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIHZhciByZWdsVHlwZSA9IHZhbHVlLl9yZWdsVHlwZTtcclxuICAgICAgICBpZiAocmVnbFR5cGUgPT09ICd0ZXh0dXJlMmQnIHx8XHJcbiAgICAgICAgICAgIHJlZ2xUeXBlID09PSAndGV4dHVyZUN1YmUnKSB7XHJcbiAgICAgICAgICByZXN1bHQgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGVudi5saW5rKHZhbHVlKVxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfSBlbHNlIGlmIChyZWdsVHlwZSA9PT0gJ2ZyYW1lYnVmZmVyJyB8fFxyXG4gICAgICAgICAgICAgICAgICAgcmVnbFR5cGUgPT09ICdmcmFtZWJ1ZmZlckN1YmUnKSB7XHJcbiAgICAgICAgICBjaGVjayQxLmNvbW1hbmQodmFsdWUuY29sb3IubGVuZ3RoID4gMCxcclxuICAgICAgICAgICAgJ21pc3NpbmcgY29sb3IgYXR0YWNobWVudCBmb3IgZnJhbWVidWZmZXIgc2VudCB0byB1bmlmb3JtIFwiJyArIG5hbWUgKyAnXCInLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICByZXN1bHQgPSBjcmVhdGVTdGF0aWNEZWNsKGZ1bmN0aW9uIChlbnYpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGVudi5saW5rKHZhbHVlLmNvbG9yWzBdKVxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGNoZWNrJDEuY29tbWFuZFJhaXNlKCdpbnZhbGlkIGRhdGEgZm9yIHVuaWZvcm0gXCInICsgbmFtZSArICdcIicsIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSBpZiAoaXNBcnJheUxpa2UodmFsdWUpKSB7XHJcbiAgICAgICAgcmVzdWx0ID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52KSB7XHJcbiAgICAgICAgICB2YXIgSVRFTSA9IGVudi5nbG9iYWwuZGVmKCdbJyxcclxuICAgICAgICAgICAgbG9vcCh2YWx1ZS5sZW5ndGgsIGZ1bmN0aW9uIChpKSB7XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kKFxyXG4gICAgICAgICAgICAgICAgdHlwZW9mIHZhbHVlW2ldID09PSAnbnVtYmVyJyB8fFxyXG4gICAgICAgICAgICAgICAgdHlwZW9mIHZhbHVlW2ldID09PSAnYm9vbGVhbicsXHJcbiAgICAgICAgICAgICAgICAnaW52YWxpZCB1bmlmb3JtICcgKyBuYW1lLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlW2ldXHJcbiAgICAgICAgICAgIH0pLCAnXScpO1xyXG4gICAgICAgICAgcmV0dXJuIElURU1cclxuICAgICAgICB9KTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBjaGVjayQxLmNvbW1hbmRSYWlzZSgnaW52YWxpZCBvciBtaXNzaW5nIGRhdGEgZm9yIHVuaWZvcm0gXCInICsgbmFtZSArICdcIicsIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgfVxyXG4gICAgICByZXN1bHQudmFsdWUgPSB2YWx1ZTtcclxuICAgICAgVU5JRk9STVNbbmFtZV0gPSByZXN1bHQ7XHJcbiAgICB9KTtcclxuXHJcbiAgICBPYmplY3Qua2V5cyhkeW5hbWljVW5pZm9ybXMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xyXG4gICAgICB2YXIgZHluID0gZHluYW1pY1VuaWZvcm1zW2tleV07XHJcbiAgICAgIFVOSUZPUk1TW2tleV0gPSBjcmVhdGVEeW5hbWljRGVjbChkeW4sIGZ1bmN0aW9uIChlbnYsIHNjb3BlKSB7XHJcbiAgICAgICAgcmV0dXJuIGVudi5pbnZva2Uoc2NvcGUsIGR5bilcclxuICAgICAgfSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICByZXR1cm4gVU5JRk9STVNcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHBhcnNlQXR0cmlidXRlcyAoYXR0cmlidXRlcywgZW52KSB7XHJcbiAgICB2YXIgc3RhdGljQXR0cmlidXRlcyA9IGF0dHJpYnV0ZXMuc3RhdGljO1xyXG4gICAgdmFyIGR5bmFtaWNBdHRyaWJ1dGVzID0gYXR0cmlidXRlcy5keW5hbWljO1xyXG5cclxuICAgIHZhciBhdHRyaWJ1dGVEZWZzID0ge307XHJcblxyXG4gICAgT2JqZWN0LmtleXMoc3RhdGljQXR0cmlidXRlcykuZm9yRWFjaChmdW5jdGlvbiAoYXR0cmlidXRlKSB7XHJcbiAgICAgIHZhciB2YWx1ZSA9IHN0YXRpY0F0dHJpYnV0ZXNbYXR0cmlidXRlXTtcclxuICAgICAgdmFyIGlkID0gc3RyaW5nU3RvcmUuaWQoYXR0cmlidXRlKTtcclxuXHJcbiAgICAgIHZhciByZWNvcmQgPSBuZXcgQXR0cmlidXRlUmVjb3JkKCk7XHJcbiAgICAgIGlmIChpc0J1ZmZlckFyZ3ModmFsdWUpKSB7XHJcbiAgICAgICAgcmVjb3JkLnN0YXRlID0gQVRUUklCX1NUQVRFX1BPSU5URVI7XHJcbiAgICAgICAgcmVjb3JkLmJ1ZmZlciA9IGJ1ZmZlclN0YXRlLmdldEJ1ZmZlcihcclxuICAgICAgICAgIGJ1ZmZlclN0YXRlLmNyZWF0ZSh2YWx1ZSwgR0xfQVJSQVlfQlVGRkVSJDEsIGZhbHNlLCB0cnVlKSk7XHJcbiAgICAgICAgcmVjb3JkLnR5cGUgPSAwO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHZhciBidWZmZXIgPSBidWZmZXJTdGF0ZS5nZXRCdWZmZXIodmFsdWUpO1xyXG4gICAgICAgIGlmIChidWZmZXIpIHtcclxuICAgICAgICAgIHJlY29yZC5zdGF0ZSA9IEFUVFJJQl9TVEFURV9QT0lOVEVSO1xyXG4gICAgICAgICAgcmVjb3JkLmJ1ZmZlciA9IGJ1ZmZlcjtcclxuICAgICAgICAgIHJlY29yZC50eXBlID0gMDtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgY2hlY2skMS5jb21tYW5kKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUsXHJcbiAgICAgICAgICAgICdpbnZhbGlkIGRhdGEgZm9yIGF0dHJpYnV0ZSAnICsgYXR0cmlidXRlLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICBpZiAoJ2NvbnN0YW50JyBpbiB2YWx1ZSkge1xyXG4gICAgICAgICAgICB2YXIgY29uc3RhbnQgPSB2YWx1ZS5jb25zdGFudDtcclxuICAgICAgICAgICAgcmVjb3JkLmJ1ZmZlciA9ICdudWxsJztcclxuICAgICAgICAgICAgcmVjb3JkLnN0YXRlID0gQVRUUklCX1NUQVRFX0NPTlNUQU5UO1xyXG4gICAgICAgICAgICBpZiAodHlwZW9mIGNvbnN0YW50ID09PSAnbnVtYmVyJykge1xyXG4gICAgICAgICAgICAgIHJlY29yZC54ID0gY29uc3RhbnQ7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kKFxyXG4gICAgICAgICAgICAgICAgaXNBcnJheUxpa2UoY29uc3RhbnQpICYmXHJcbiAgICAgICAgICAgICAgICBjb25zdGFudC5sZW5ndGggPiAwICYmXHJcbiAgICAgICAgICAgICAgICBjb25zdGFudC5sZW5ndGggPD0gNCxcclxuICAgICAgICAgICAgICAgICdpbnZhbGlkIGNvbnN0YW50IGZvciBhdHRyaWJ1dGUgJyArIGF0dHJpYnV0ZSwgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgIENVVEVfQ09NUE9ORU5UUy5mb3JFYWNoKGZ1bmN0aW9uIChjLCBpKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoaSA8IGNvbnN0YW50Lmxlbmd0aCkge1xyXG4gICAgICAgICAgICAgICAgICByZWNvcmRbY10gPSBjb25zdGFudFtpXTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgaWYgKGlzQnVmZmVyQXJncyh2YWx1ZS5idWZmZXIpKSB7XHJcbiAgICAgICAgICAgICAgYnVmZmVyID0gYnVmZmVyU3RhdGUuZ2V0QnVmZmVyKFxyXG4gICAgICAgICAgICAgICAgYnVmZmVyU3RhdGUuY3JlYXRlKHZhbHVlLmJ1ZmZlciwgR0xfQVJSQVlfQlVGRkVSJDEsIGZhbHNlLCB0cnVlKSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgYnVmZmVyID0gYnVmZmVyU3RhdGUuZ2V0QnVmZmVyKHZhbHVlLmJ1ZmZlcik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kKCEhYnVmZmVyLCAnbWlzc2luZyBidWZmZXIgZm9yIGF0dHJpYnV0ZSBcIicgKyBhdHRyaWJ1dGUgKyAnXCInLCBlbnYuY29tbWFuZFN0cik7XHJcblxyXG4gICAgICAgICAgICB2YXIgb2Zmc2V0ID0gdmFsdWUub2Zmc2V0IHwgMDtcclxuICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kKG9mZnNldCA+PSAwLFxyXG4gICAgICAgICAgICAgICdpbnZhbGlkIG9mZnNldCBmb3IgYXR0cmlidXRlIFwiJyArIGF0dHJpYnV0ZSArICdcIicsIGVudi5jb21tYW5kU3RyKTtcclxuXHJcbiAgICAgICAgICAgIHZhciBzdHJpZGUgPSB2YWx1ZS5zdHJpZGUgfCAwO1xyXG4gICAgICAgICAgICBjaGVjayQxLmNvbW1hbmQoc3RyaWRlID49IDAgJiYgc3RyaWRlIDwgMjU2LFxyXG4gICAgICAgICAgICAgICdpbnZhbGlkIHN0cmlkZSBmb3IgYXR0cmlidXRlIFwiJyArIGF0dHJpYnV0ZSArICdcIiwgbXVzdCBiZSBpbnRlZ2VyIGJldHdlZWVuIFswLCAyNTVdJywgZW52LmNvbW1hbmRTdHIpO1xyXG5cclxuICAgICAgICAgICAgdmFyIHNpemUgPSB2YWx1ZS5zaXplIHwgMDtcclxuICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kKCEoJ3NpemUnIGluIHZhbHVlKSB8fCAoc2l6ZSA+IDAgJiYgc2l6ZSA8PSA0KSxcclxuICAgICAgICAgICAgICAnaW52YWxpZCBzaXplIGZvciBhdHRyaWJ1dGUgXCInICsgYXR0cmlidXRlICsgJ1wiLCBtdXN0IGJlIDEsMiwzLDQnLCBlbnYuY29tbWFuZFN0cik7XHJcblxyXG4gICAgICAgICAgICB2YXIgbm9ybWFsaXplZCA9ICEhdmFsdWUubm9ybWFsaXplZDtcclxuXHJcbiAgICAgICAgICAgIHZhciB0eXBlID0gMDtcclxuICAgICAgICAgICAgaWYgKCd0eXBlJyBpbiB2YWx1ZSkge1xyXG4gICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZFBhcmFtZXRlcihcclxuICAgICAgICAgICAgICAgIHZhbHVlLnR5cGUsIGdsVHlwZXMsXHJcbiAgICAgICAgICAgICAgICAnaW52YWxpZCB0eXBlIGZvciBhdHRyaWJ1dGUgJyArIGF0dHJpYnV0ZSwgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgIHR5cGUgPSBnbFR5cGVzW3ZhbHVlLnR5cGVdO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICB2YXIgZGl2aXNvciA9IHZhbHVlLmRpdmlzb3IgfCAwO1xyXG4gICAgICAgICAgICBpZiAoJ2Rpdmlzb3InIGluIHZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kKGRpdmlzb3IgPT09IDAgfHwgZXh0SW5zdGFuY2luZyxcclxuICAgICAgICAgICAgICAgICdjYW5ub3Qgc3BlY2lmeSBkaXZpc29yIGZvciBhdHRyaWJ1dGUgXCInICsgYXR0cmlidXRlICsgJ1wiLCBpbnN0YW5jaW5nIG5vdCBzdXBwb3J0ZWQnLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kKGRpdmlzb3IgPj0gMCxcclxuICAgICAgICAgICAgICAgICdpbnZhbGlkIGRpdmlzb3IgZm9yIGF0dHJpYnV0ZSBcIicgKyBhdHRyaWJ1dGUgKyAnXCInLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGNoZWNrJDEub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgIHZhciBjb21tYW5kID0gZW52LmNvbW1hbmRTdHI7XHJcblxyXG4gICAgICAgICAgICAgIHZhciBWQUxJRF9LRVlTID0gW1xyXG4gICAgICAgICAgICAgICAgJ2J1ZmZlcicsXHJcbiAgICAgICAgICAgICAgICAnb2Zmc2V0JyxcclxuICAgICAgICAgICAgICAgICdkaXZpc29yJyxcclxuICAgICAgICAgICAgICAgICdub3JtYWxpemVkJyxcclxuICAgICAgICAgICAgICAgICd0eXBlJyxcclxuICAgICAgICAgICAgICAgICdzaXplJyxcclxuICAgICAgICAgICAgICAgICdzdHJpZGUnXHJcbiAgICAgICAgICAgICAgXTtcclxuXHJcbiAgICAgICAgICAgICAgT2JqZWN0LmtleXModmFsdWUpLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcclxuICAgICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZChcclxuICAgICAgICAgICAgICAgICAgVkFMSURfS0VZUy5pbmRleE9mKHByb3ApID49IDAsXHJcbiAgICAgICAgICAgICAgICAgICd1bmtub3duIHBhcmFtZXRlciBcIicgKyBwcm9wICsgJ1wiIGZvciBhdHRyaWJ1dGUgcG9pbnRlciBcIicgKyBhdHRyaWJ1dGUgKyAnXCIgKHZhbGlkIHBhcmFtZXRlcnMgYXJlICcgKyBWQUxJRF9LRVlTICsgJyknLFxyXG4gICAgICAgICAgICAgICAgICBjb21tYW5kKTtcclxuICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICByZWNvcmQuYnVmZmVyID0gYnVmZmVyO1xyXG4gICAgICAgICAgICByZWNvcmQuc3RhdGUgPSBBVFRSSUJfU1RBVEVfUE9JTlRFUjtcclxuICAgICAgICAgICAgcmVjb3JkLnNpemUgPSBzaXplO1xyXG4gICAgICAgICAgICByZWNvcmQubm9ybWFsaXplZCA9IG5vcm1hbGl6ZWQ7XHJcbiAgICAgICAgICAgIHJlY29yZC50eXBlID0gdHlwZSB8fCBidWZmZXIuZHR5cGU7XHJcbiAgICAgICAgICAgIHJlY29yZC5vZmZzZXQgPSBvZmZzZXQ7XHJcbiAgICAgICAgICAgIHJlY29yZC5zdHJpZGUgPSBzdHJpZGU7XHJcbiAgICAgICAgICAgIHJlY29yZC5kaXZpc29yID0gZGl2aXNvcjtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGF0dHJpYnV0ZURlZnNbYXR0cmlidXRlXSA9IGNyZWF0ZVN0YXRpY0RlY2woZnVuY3Rpb24gKGVudiwgc2NvcGUpIHtcclxuICAgICAgICB2YXIgY2FjaGUgPSBlbnYuYXR0cmliQ2FjaGU7XHJcbiAgICAgICAgaWYgKGlkIGluIGNhY2hlKSB7XHJcbiAgICAgICAgICByZXR1cm4gY2FjaGVbaWRdXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHZhciByZXN1bHQgPSB7XHJcbiAgICAgICAgICBpc1N0cmVhbTogZmFsc2VcclxuICAgICAgICB9O1xyXG4gICAgICAgIE9iamVjdC5rZXlzKHJlY29yZCkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XHJcbiAgICAgICAgICByZXN1bHRba2V5XSA9IHJlY29yZFtrZXldO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGlmIChyZWNvcmQuYnVmZmVyKSB7XHJcbiAgICAgICAgICByZXN1bHQuYnVmZmVyID0gZW52LmxpbmsocmVjb3JkLmJ1ZmZlcik7XHJcbiAgICAgICAgICByZXN1bHQudHlwZSA9IHJlc3VsdC50eXBlIHx8IChyZXN1bHQuYnVmZmVyICsgJy5kdHlwZScpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjYWNoZVtpZF0gPSByZXN1bHQ7XHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxyXG4gICAgICB9KTtcclxuICAgIH0pO1xyXG5cclxuICAgIE9iamVjdC5rZXlzKGR5bmFtaWNBdHRyaWJ1dGVzKS5mb3JFYWNoKGZ1bmN0aW9uIChhdHRyaWJ1dGUpIHtcclxuICAgICAgdmFyIGR5biA9IGR5bmFtaWNBdHRyaWJ1dGVzW2F0dHJpYnV0ZV07XHJcblxyXG4gICAgICBmdW5jdGlvbiBhcHBlbmRBdHRyaWJ1dGVDb2RlIChlbnYsIGJsb2NrKSB7XHJcbiAgICAgICAgdmFyIFZBTFVFID0gZW52Lmludm9rZShibG9jaywgZHluKTtcclxuXHJcbiAgICAgICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWQ7XHJcblxyXG4gICAgICAgIHZhciBJU19CVUZGRVJfQVJHUyA9IHNoYXJlZC5pc0J1ZmZlckFyZ3M7XHJcbiAgICAgICAgdmFyIEJVRkZFUl9TVEFURSA9IHNoYXJlZC5idWZmZXI7XHJcblxyXG4gICAgICAgIC8vIFBlcmZvcm0gdmFsaWRhdGlvbiBvbiBhdHRyaWJ1dGVcclxuICAgICAgICBjaGVjayQxLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgIGVudi5hc3NlcnQoYmxvY2ssXHJcbiAgICAgICAgICAgIFZBTFVFICsgJyYmKHR5cGVvZiAnICsgVkFMVUUgKyAnPT09XCJvYmplY3RcInx8dHlwZW9mICcgK1xyXG4gICAgICAgICAgICBWQUxVRSArICc9PT1cImZ1bmN0aW9uXCIpJiYoJyArXHJcbiAgICAgICAgICAgIElTX0JVRkZFUl9BUkdTICsgJygnICsgVkFMVUUgKyAnKXx8JyArXHJcbiAgICAgICAgICAgIEJVRkZFUl9TVEFURSArICcuZ2V0QnVmZmVyKCcgKyBWQUxVRSArICcpfHwnICtcclxuICAgICAgICAgICAgQlVGRkVSX1NUQVRFICsgJy5nZXRCdWZmZXIoJyArIFZBTFVFICsgJy5idWZmZXIpfHwnICtcclxuICAgICAgICAgICAgSVNfQlVGRkVSX0FSR1MgKyAnKCcgKyBWQUxVRSArICcuYnVmZmVyKXx8JyArXHJcbiAgICAgICAgICAgICcoXCJjb25zdGFudFwiIGluICcgKyBWQUxVRSArXHJcbiAgICAgICAgICAgICcmJih0eXBlb2YgJyArIFZBTFVFICsgJy5jb25zdGFudD09PVwibnVtYmVyXCJ8fCcgK1xyXG4gICAgICAgICAgICBzaGFyZWQuaXNBcnJheUxpa2UgKyAnKCcgKyBWQUxVRSArICcuY29uc3RhbnQpKSkpJyxcclxuICAgICAgICAgICAgJ2ludmFsaWQgZHluYW1pYyBhdHRyaWJ1dGUgXCInICsgYXR0cmlidXRlICsgJ1wiJyk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIGFsbG9jYXRlIG5hbWVzIGZvciByZXN1bHRcclxuICAgICAgICB2YXIgcmVzdWx0ID0ge1xyXG4gICAgICAgICAgaXNTdHJlYW06IGJsb2NrLmRlZihmYWxzZSlcclxuICAgICAgICB9O1xyXG4gICAgICAgIHZhciBkZWZhdWx0UmVjb3JkID0gbmV3IEF0dHJpYnV0ZVJlY29yZCgpO1xyXG4gICAgICAgIGRlZmF1bHRSZWNvcmQuc3RhdGUgPSBBVFRSSUJfU1RBVEVfUE9JTlRFUjtcclxuICAgICAgICBPYmplY3Qua2V5cyhkZWZhdWx0UmVjb3JkKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcclxuICAgICAgICAgIHJlc3VsdFtrZXldID0gYmxvY2suZGVmKCcnICsgZGVmYXVsdFJlY29yZFtrZXldKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdmFyIEJVRkZFUiA9IHJlc3VsdC5idWZmZXI7XHJcbiAgICAgICAgdmFyIFRZUEUgPSByZXN1bHQudHlwZTtcclxuICAgICAgICBibG9jayhcclxuICAgICAgICAgICdpZignLCBJU19CVUZGRVJfQVJHUywgJygnLCBWQUxVRSwgJykpeycsXHJcbiAgICAgICAgICByZXN1bHQuaXNTdHJlYW0sICc9dHJ1ZTsnLFxyXG4gICAgICAgICAgQlVGRkVSLCAnPScsIEJVRkZFUl9TVEFURSwgJy5jcmVhdGVTdHJlYW0oJywgR0xfQVJSQVlfQlVGRkVSJDEsICcsJywgVkFMVUUsICcpOycsXHJcbiAgICAgICAgICBUWVBFLCAnPScsIEJVRkZFUiwgJy5kdHlwZTsnLFxyXG4gICAgICAgICAgJ31lbHNleycsXHJcbiAgICAgICAgICBCVUZGRVIsICc9JywgQlVGRkVSX1NUQVRFLCAnLmdldEJ1ZmZlcignLCBWQUxVRSwgJyk7JyxcclxuICAgICAgICAgICdpZignLCBCVUZGRVIsICcpeycsXHJcbiAgICAgICAgICBUWVBFLCAnPScsIEJVRkZFUiwgJy5kdHlwZTsnLFxyXG4gICAgICAgICAgJ31lbHNlIGlmKFwiY29uc3RhbnRcIiBpbiAnLCBWQUxVRSwgJyl7JyxcclxuICAgICAgICAgIHJlc3VsdC5zdGF0ZSwgJz0nLCBBVFRSSUJfU1RBVEVfQ09OU1RBTlQsICc7JyxcclxuICAgICAgICAgICdpZih0eXBlb2YgJyArIFZBTFVFICsgJy5jb25zdGFudCA9PT0gXCJudW1iZXJcIil7JyxcclxuICAgICAgICAgIHJlc3VsdFtDVVRFX0NPTVBPTkVOVFNbMF1dLCAnPScsIFZBTFVFLCAnLmNvbnN0YW50OycsXHJcbiAgICAgICAgICBDVVRFX0NPTVBPTkVOVFMuc2xpY2UoMSkubWFwKGZ1bmN0aW9uIChuKSB7XHJcbiAgICAgICAgICAgIHJldHVybiByZXN1bHRbbl1cclxuICAgICAgICAgIH0pLmpvaW4oJz0nKSwgJz0wOycsXHJcbiAgICAgICAgICAnfWVsc2V7JyxcclxuICAgICAgICAgIENVVEVfQ09NUE9ORU5UUy5tYXAoZnVuY3Rpb24gKG5hbWUsIGkpIHtcclxuICAgICAgICAgICAgcmV0dXJuIChcclxuICAgICAgICAgICAgICByZXN1bHRbbmFtZV0gKyAnPScgKyBWQUxVRSArICcuY29uc3RhbnQubGVuZ3RoPicgKyBpICtcclxuICAgICAgICAgICAgICAnPycgKyBWQUxVRSArICcuY29uc3RhbnRbJyArIGkgKyAnXTowOydcclxuICAgICAgICAgICAgKVxyXG4gICAgICAgICAgfSkuam9pbignJyksXHJcbiAgICAgICAgICAnfX1lbHNleycsXHJcbiAgICAgICAgICAnaWYoJywgSVNfQlVGRkVSX0FSR1MsICcoJywgVkFMVUUsICcuYnVmZmVyKSl7JyxcclxuICAgICAgICAgIEJVRkZFUiwgJz0nLCBCVUZGRVJfU1RBVEUsICcuY3JlYXRlU3RyZWFtKCcsIEdMX0FSUkFZX0JVRkZFUiQxLCAnLCcsIFZBTFVFLCAnLmJ1ZmZlcik7JyxcclxuICAgICAgICAgICd9ZWxzZXsnLFxyXG4gICAgICAgICAgQlVGRkVSLCAnPScsIEJVRkZFUl9TVEFURSwgJy5nZXRCdWZmZXIoJywgVkFMVUUsICcuYnVmZmVyKTsnLFxyXG4gICAgICAgICAgJ30nLFxyXG4gICAgICAgICAgVFlQRSwgJz1cInR5cGVcIiBpbiAnLCBWQUxVRSwgJz8nLFxyXG4gICAgICAgICAgc2hhcmVkLmdsVHlwZXMsICdbJywgVkFMVUUsICcudHlwZV06JywgQlVGRkVSLCAnLmR0eXBlOycsXHJcbiAgICAgICAgICByZXN1bHQubm9ybWFsaXplZCwgJz0hIScsIFZBTFVFLCAnLm5vcm1hbGl6ZWQ7Jyk7XHJcbiAgICAgICAgZnVuY3Rpb24gZW1pdFJlYWRSZWNvcmQgKG5hbWUpIHtcclxuICAgICAgICAgIGJsb2NrKHJlc3VsdFtuYW1lXSwgJz0nLCBWQUxVRSwgJy4nLCBuYW1lLCAnfDA7Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVtaXRSZWFkUmVjb3JkKCdzaXplJyk7XHJcbiAgICAgICAgZW1pdFJlYWRSZWNvcmQoJ29mZnNldCcpO1xyXG4gICAgICAgIGVtaXRSZWFkUmVjb3JkKCdzdHJpZGUnKTtcclxuICAgICAgICBlbWl0UmVhZFJlY29yZCgnZGl2aXNvcicpO1xyXG5cclxuICAgICAgICBibG9jaygnfX0nKTtcclxuXHJcbiAgICAgICAgYmxvY2suZXhpdChcclxuICAgICAgICAgICdpZignLCByZXN1bHQuaXNTdHJlYW0sICcpeycsXHJcbiAgICAgICAgICBCVUZGRVJfU1RBVEUsICcuZGVzdHJveVN0cmVhbSgnLCBCVUZGRVIsICcpOycsXHJcbiAgICAgICAgICAnfScpO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGF0dHJpYnV0ZURlZnNbYXR0cmlidXRlXSA9IGNyZWF0ZUR5bmFtaWNEZWNsKGR5biwgYXBwZW5kQXR0cmlidXRlQ29kZSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICByZXR1cm4gYXR0cmlidXRlRGVmc1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gcGFyc2VDb250ZXh0IChjb250ZXh0KSB7XHJcbiAgICB2YXIgc3RhdGljQ29udGV4dCA9IGNvbnRleHQuc3RhdGljO1xyXG4gICAgdmFyIGR5bmFtaWNDb250ZXh0ID0gY29udGV4dC5keW5hbWljO1xyXG4gICAgdmFyIHJlc3VsdCA9IHt9O1xyXG5cclxuICAgIE9iamVjdC5rZXlzKHN0YXRpY0NvbnRleHQpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcclxuICAgICAgdmFyIHZhbHVlID0gc3RhdGljQ29udGV4dFtuYW1lXTtcclxuICAgICAgcmVzdWx0W25hbWVdID0gY3JlYXRlU3RhdGljRGVjbChmdW5jdGlvbiAoZW52LCBzY29wZSkge1xyXG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInIHx8IHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XHJcbiAgICAgICAgICByZXR1cm4gJycgKyB2YWx1ZVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICByZXR1cm4gZW52LmxpbmsodmFsdWUpXHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuICAgIH0pO1xyXG5cclxuICAgIE9iamVjdC5rZXlzKGR5bmFtaWNDb250ZXh0KS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XHJcbiAgICAgIHZhciBkeW4gPSBkeW5hbWljQ29udGV4dFtuYW1lXTtcclxuICAgICAgcmVzdWx0W25hbWVdID0gY3JlYXRlRHluYW1pY0RlY2woZHluLCBmdW5jdGlvbiAoZW52LCBzY29wZSkge1xyXG4gICAgICAgIHJldHVybiBlbnYuaW52b2tlKHNjb3BlLCBkeW4pXHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIHJlc3VsdFxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gcGFyc2VBcmd1bWVudHMgKG9wdGlvbnMsIGF0dHJpYnV0ZXMsIHVuaWZvcm1zLCBjb250ZXh0LCBlbnYpIHtcclxuICAgIHZhciBzdGF0aWNPcHRpb25zID0gb3B0aW9ucy5zdGF0aWM7XHJcbiAgICB2YXIgZHluYW1pY09wdGlvbnMgPSBvcHRpb25zLmR5bmFtaWM7XHJcblxyXG4gICAgY2hlY2skMS5vcHRpb25hbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgIHZhciBLRVlfTkFNRVMgPSBbXHJcbiAgICAgICAgU19GUkFNRUJVRkZFUixcclxuICAgICAgICBTX1ZFUlQsXHJcbiAgICAgICAgU19GUkFHLFxyXG4gICAgICAgIFNfRUxFTUVOVFMsXHJcbiAgICAgICAgU19QUklNSVRJVkUsXHJcbiAgICAgICAgU19PRkZTRVQsXHJcbiAgICAgICAgU19DT1VOVCxcclxuICAgICAgICBTX0lOU1RBTkNFUyxcclxuICAgICAgICBTX1BST0ZJTEVcclxuICAgICAgXS5jb25jYXQoR0xfU1RBVEVfTkFNRVMpO1xyXG5cclxuICAgICAgZnVuY3Rpb24gY2hlY2tLZXlzIChkaWN0KSB7XHJcbiAgICAgICAgT2JqZWN0LmtleXMoZGljdCkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XHJcbiAgICAgICAgICBjaGVjayQxLmNvbW1hbmQoXHJcbiAgICAgICAgICAgIEtFWV9OQU1FUy5pbmRleE9mKGtleSkgPj0gMCxcclxuICAgICAgICAgICAgJ3Vua25vd24gcGFyYW1ldGVyIFwiJyArIGtleSArICdcIicsXHJcbiAgICAgICAgICAgIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY2hlY2tLZXlzKHN0YXRpY09wdGlvbnMpO1xyXG4gICAgICBjaGVja0tleXMoZHluYW1pY09wdGlvbnMpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgdmFyIGZyYW1lYnVmZmVyID0gcGFyc2VGcmFtZWJ1ZmZlcihvcHRpb25zLCBlbnYpO1xyXG4gICAgdmFyIHZpZXdwb3J0QW5kU2Npc3NvciA9IHBhcnNlVmlld3BvcnRTY2lzc29yKG9wdGlvbnMsIGZyYW1lYnVmZmVyLCBlbnYpO1xyXG4gICAgdmFyIGRyYXcgPSBwYXJzZURyYXcob3B0aW9ucywgZW52KTtcclxuICAgIHZhciBzdGF0ZSA9IHBhcnNlR0xTdGF0ZShvcHRpb25zLCBlbnYpO1xyXG4gICAgdmFyIHNoYWRlciA9IHBhcnNlUHJvZ3JhbShvcHRpb25zLCBlbnYpO1xyXG5cclxuICAgIGZ1bmN0aW9uIGNvcHlCb3ggKG5hbWUpIHtcclxuICAgICAgdmFyIGRlZm4gPSB2aWV3cG9ydEFuZFNjaXNzb3JbbmFtZV07XHJcbiAgICAgIGlmIChkZWZuKSB7XHJcbiAgICAgICAgc3RhdGVbbmFtZV0gPSBkZWZuO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBjb3B5Qm94KFNfVklFV1BPUlQpO1xyXG4gICAgY29weUJveChwcm9wTmFtZShTX1NDSVNTT1JfQk9YKSk7XHJcblxyXG4gICAgdmFyIGRpcnR5ID0gT2JqZWN0LmtleXMoc3RhdGUpLmxlbmd0aCA+IDA7XHJcblxyXG4gICAgdmFyIHJlc3VsdCA9IHtcclxuICAgICAgZnJhbWVidWZmZXI6IGZyYW1lYnVmZmVyLFxyXG4gICAgICBkcmF3OiBkcmF3LFxyXG4gICAgICBzaGFkZXI6IHNoYWRlcixcclxuICAgICAgc3RhdGU6IHN0YXRlLFxyXG4gICAgICBkaXJ0eTogZGlydHlcclxuICAgIH07XHJcblxyXG4gICAgcmVzdWx0LnByb2ZpbGUgPSBwYXJzZVByb2ZpbGUob3B0aW9ucywgZW52KTtcclxuICAgIHJlc3VsdC51bmlmb3JtcyA9IHBhcnNlVW5pZm9ybXModW5pZm9ybXMsIGVudik7XHJcbiAgICByZXN1bHQuYXR0cmlidXRlcyA9IHBhcnNlQXR0cmlidXRlcyhhdHRyaWJ1dGVzLCBlbnYpO1xyXG4gICAgcmVzdWx0LmNvbnRleHQgPSBwYXJzZUNvbnRleHQoY29udGV4dCwgZW52KTtcclxuICAgIHJldHVybiByZXN1bHRcclxuICB9XHJcblxyXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gIC8vIENPTU1PTiBVUERBVEUgRlVOQ1RJT05TXHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgZnVuY3Rpb24gZW1pdENvbnRleHQgKGVudiwgc2NvcGUsIGNvbnRleHQpIHtcclxuICAgIHZhciBzaGFyZWQgPSBlbnYuc2hhcmVkO1xyXG4gICAgdmFyIENPTlRFWFQgPSBzaGFyZWQuY29udGV4dDtcclxuXHJcbiAgICB2YXIgY29udGV4dEVudGVyID0gZW52LnNjb3BlKCk7XHJcblxyXG4gICAgT2JqZWN0LmtleXMoY29udGV4dCkuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xyXG4gICAgICBzY29wZS5zYXZlKENPTlRFWFQsICcuJyArIG5hbWUpO1xyXG4gICAgICB2YXIgZGVmbiA9IGNvbnRleHRbbmFtZV07XHJcbiAgICAgIGNvbnRleHRFbnRlcihDT05URVhULCAnLicsIG5hbWUsICc9JywgZGVmbi5hcHBlbmQoZW52LCBzY29wZSksICc7Jyk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBzY29wZShjb250ZXh0RW50ZXIpO1xyXG4gIH1cclxuXHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgLy8gQ09NTU9OIERSQVdJTkcgRlVOQ1RJT05TXHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgZnVuY3Rpb24gZW1pdFBvbGxGcmFtZWJ1ZmZlciAoZW52LCBzY29wZSwgZnJhbWVidWZmZXIsIHNraXBDaGVjaykge1xyXG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWQ7XHJcblxyXG4gICAgdmFyIEdMID0gc2hhcmVkLmdsO1xyXG4gICAgdmFyIEZSQU1FQlVGRkVSX1NUQVRFID0gc2hhcmVkLmZyYW1lYnVmZmVyO1xyXG4gICAgdmFyIEVYVF9EUkFXX0JVRkZFUlM7XHJcbiAgICBpZiAoZXh0RHJhd0J1ZmZlcnMpIHtcclxuICAgICAgRVhUX0RSQVdfQlVGRkVSUyA9IHNjb3BlLmRlZihzaGFyZWQuZXh0ZW5zaW9ucywgJy53ZWJnbF9kcmF3X2J1ZmZlcnMnKTtcclxuICAgIH1cclxuXHJcbiAgICB2YXIgY29uc3RhbnRzID0gZW52LmNvbnN0YW50cztcclxuXHJcbiAgICB2YXIgRFJBV19CVUZGRVJTID0gY29uc3RhbnRzLmRyYXdCdWZmZXI7XHJcbiAgICB2YXIgQkFDS19CVUZGRVIgPSBjb25zdGFudHMuYmFja0J1ZmZlcjtcclxuXHJcbiAgICB2YXIgTkVYVDtcclxuICAgIGlmIChmcmFtZWJ1ZmZlcikge1xyXG4gICAgICBORVhUID0gZnJhbWVidWZmZXIuYXBwZW5kKGVudiwgc2NvcGUpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgTkVYVCA9IHNjb3BlLmRlZihGUkFNRUJVRkZFUl9TVEFURSwgJy5uZXh0Jyk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCFza2lwQ2hlY2spIHtcclxuICAgICAgc2NvcGUoJ2lmKCcsIE5FWFQsICchPT0nLCBGUkFNRUJVRkZFUl9TVEFURSwgJy5jdXIpeycpO1xyXG4gICAgfVxyXG4gICAgc2NvcGUoXHJcbiAgICAgICdpZignLCBORVhULCAnKXsnLFxyXG4gICAgICBHTCwgJy5iaW5kRnJhbWVidWZmZXIoJywgR0xfRlJBTUVCVUZGRVIkMiwgJywnLCBORVhULCAnLmZyYW1lYnVmZmVyKTsnKTtcclxuICAgIGlmIChleHREcmF3QnVmZmVycykge1xyXG4gICAgICBzY29wZShFWFRfRFJBV19CVUZGRVJTLCAnLmRyYXdCdWZmZXJzV0VCR0woJyxcclxuICAgICAgICBEUkFXX0JVRkZFUlMsICdbJywgTkVYVCwgJy5jb2xvckF0dGFjaG1lbnRzLmxlbmd0aF0pOycpO1xyXG4gICAgfVxyXG4gICAgc2NvcGUoJ31lbHNleycsXHJcbiAgICAgIEdMLCAnLmJpbmRGcmFtZWJ1ZmZlcignLCBHTF9GUkFNRUJVRkZFUiQyLCAnLG51bGwpOycpO1xyXG4gICAgaWYgKGV4dERyYXdCdWZmZXJzKSB7XHJcbiAgICAgIHNjb3BlKEVYVF9EUkFXX0JVRkZFUlMsICcuZHJhd0J1ZmZlcnNXRUJHTCgnLCBCQUNLX0JVRkZFUiwgJyk7Jyk7XHJcbiAgICB9XHJcbiAgICBzY29wZShcclxuICAgICAgJ30nLFxyXG4gICAgICBGUkFNRUJVRkZFUl9TVEFURSwgJy5jdXI9JywgTkVYVCwgJzsnKTtcclxuICAgIGlmICghc2tpcENoZWNrKSB7XHJcbiAgICAgIHNjb3BlKCd9Jyk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBlbWl0UG9sbFN0YXRlIChlbnYsIHNjb3BlLCBhcmdzKSB7XHJcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZDtcclxuXHJcbiAgICB2YXIgR0wgPSBzaGFyZWQuZ2w7XHJcblxyXG4gICAgdmFyIENVUlJFTlRfVkFSUyA9IGVudi5jdXJyZW50O1xyXG4gICAgdmFyIE5FWFRfVkFSUyA9IGVudi5uZXh0O1xyXG4gICAgdmFyIENVUlJFTlRfU1RBVEUgPSBzaGFyZWQuY3VycmVudDtcclxuICAgIHZhciBORVhUX1NUQVRFID0gc2hhcmVkLm5leHQ7XHJcblxyXG4gICAgdmFyIGJsb2NrID0gZW52LmNvbmQoQ1VSUkVOVF9TVEFURSwgJy5kaXJ0eScpO1xyXG5cclxuICAgIEdMX1NUQVRFX05BTUVTLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcclxuICAgICAgdmFyIHBhcmFtID0gcHJvcE5hbWUocHJvcCk7XHJcbiAgICAgIGlmIChwYXJhbSBpbiBhcmdzLnN0YXRlKSB7XHJcbiAgICAgICAgcmV0dXJuXHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHZhciBORVhULCBDVVJSRU5UO1xyXG4gICAgICBpZiAocGFyYW0gaW4gTkVYVF9WQVJTKSB7XHJcbiAgICAgICAgTkVYVCA9IE5FWFRfVkFSU1twYXJhbV07XHJcbiAgICAgICAgQ1VSUkVOVCA9IENVUlJFTlRfVkFSU1twYXJhbV07XHJcbiAgICAgICAgdmFyIHBhcnRzID0gbG9vcChjdXJyZW50U3RhdGVbcGFyYW1dLmxlbmd0aCwgZnVuY3Rpb24gKGkpIHtcclxuICAgICAgICAgIHJldHVybiBibG9jay5kZWYoTkVYVCwgJ1snLCBpLCAnXScpXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgYmxvY2soZW52LmNvbmQocGFydHMubWFwKGZ1bmN0aW9uIChwLCBpKSB7XHJcbiAgICAgICAgICByZXR1cm4gcCArICchPT0nICsgQ1VSUkVOVCArICdbJyArIGkgKyAnXSdcclxuICAgICAgICB9KS5qb2luKCd8fCcpKVxyXG4gICAgICAgICAgLnRoZW4oXHJcbiAgICAgICAgICAgIEdMLCAnLicsIEdMX1ZBUklBQkxFU1twYXJhbV0sICcoJywgcGFydHMsICcpOycsXHJcbiAgICAgICAgICAgIHBhcnRzLm1hcChmdW5jdGlvbiAocCwgaSkge1xyXG4gICAgICAgICAgICAgIHJldHVybiBDVVJSRU5UICsgJ1snICsgaSArICddPScgKyBwXHJcbiAgICAgICAgICAgIH0pLmpvaW4oJzsnKSwgJzsnKSk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgTkVYVCA9IGJsb2NrLmRlZihORVhUX1NUQVRFLCAnLicsIHBhcmFtKTtcclxuICAgICAgICB2YXIgaWZ0ZSA9IGVudi5jb25kKE5FWFQsICchPT0nLCBDVVJSRU5UX1NUQVRFLCAnLicsIHBhcmFtKTtcclxuICAgICAgICBibG9jayhpZnRlKTtcclxuICAgICAgICBpZiAocGFyYW0gaW4gR0xfRkxBR1MpIHtcclxuICAgICAgICAgIGlmdGUoXHJcbiAgICAgICAgICAgIGVudi5jb25kKE5FWFQpXHJcbiAgICAgICAgICAgICAgICAudGhlbihHTCwgJy5lbmFibGUoJywgR0xfRkxBR1NbcGFyYW1dLCAnKTsnKVxyXG4gICAgICAgICAgICAgICAgLmVsc2UoR0wsICcuZGlzYWJsZSgnLCBHTF9GTEFHU1twYXJhbV0sICcpOycpLFxyXG4gICAgICAgICAgICBDVVJSRU5UX1NUQVRFLCAnLicsIHBhcmFtLCAnPScsIE5FWFQsICc7Jyk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGlmdGUoXHJcbiAgICAgICAgICAgIEdMLCAnLicsIEdMX1ZBUklBQkxFU1twYXJhbV0sICcoJywgTkVYVCwgJyk7JyxcclxuICAgICAgICAgICAgQ1VSUkVOVF9TVEFURSwgJy4nLCBwYXJhbSwgJz0nLCBORVhULCAnOycpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgICBpZiAoT2JqZWN0LmtleXMoYXJncy5zdGF0ZSkubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIGJsb2NrKENVUlJFTlRfU1RBVEUsICcuZGlydHk9ZmFsc2U7Jyk7XHJcbiAgICB9XHJcbiAgICBzY29wZShibG9jayk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBlbWl0U2V0T3B0aW9ucyAoZW52LCBzY29wZSwgb3B0aW9ucywgZmlsdGVyKSB7XHJcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZDtcclxuICAgIHZhciBDVVJSRU5UX1ZBUlMgPSBlbnYuY3VycmVudDtcclxuICAgIHZhciBDVVJSRU5UX1NUQVRFID0gc2hhcmVkLmN1cnJlbnQ7XHJcbiAgICB2YXIgR0wgPSBzaGFyZWQuZ2w7XHJcbiAgICBzb3J0U3RhdGUoT2JqZWN0LmtleXMob3B0aW9ucykpLmZvckVhY2goZnVuY3Rpb24gKHBhcmFtKSB7XHJcbiAgICAgIHZhciBkZWZuID0gb3B0aW9uc1twYXJhbV07XHJcbiAgICAgIGlmIChmaWx0ZXIgJiYgIWZpbHRlcihkZWZuKSkge1xyXG4gICAgICAgIHJldHVyblxyXG4gICAgICB9XHJcbiAgICAgIHZhciB2YXJpYWJsZSA9IGRlZm4uYXBwZW5kKGVudiwgc2NvcGUpO1xyXG4gICAgICBpZiAoR0xfRkxBR1NbcGFyYW1dKSB7XHJcbiAgICAgICAgdmFyIGZsYWcgPSBHTF9GTEFHU1twYXJhbV07XHJcbiAgICAgICAgaWYgKGlzU3RhdGljKGRlZm4pKSB7XHJcbiAgICAgICAgICBpZiAodmFyaWFibGUpIHtcclxuICAgICAgICAgICAgc2NvcGUoR0wsICcuZW5hYmxlKCcsIGZsYWcsICcpOycpO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgc2NvcGUoR0wsICcuZGlzYWJsZSgnLCBmbGFnLCAnKTsnKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgc2NvcGUoZW52LmNvbmQodmFyaWFibGUpXHJcbiAgICAgICAgICAgIC50aGVuKEdMLCAnLmVuYWJsZSgnLCBmbGFnLCAnKTsnKVxyXG4gICAgICAgICAgICAuZWxzZShHTCwgJy5kaXNhYmxlKCcsIGZsYWcsICcpOycpKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgc2NvcGUoQ1VSUkVOVF9TVEFURSwgJy4nLCBwYXJhbSwgJz0nLCB2YXJpYWJsZSwgJzsnKTtcclxuICAgICAgfSBlbHNlIGlmIChpc0FycmF5TGlrZSh2YXJpYWJsZSkpIHtcclxuICAgICAgICB2YXIgQ1VSUkVOVCA9IENVUlJFTlRfVkFSU1twYXJhbV07XHJcbiAgICAgICAgc2NvcGUoXHJcbiAgICAgICAgICBHTCwgJy4nLCBHTF9WQVJJQUJMRVNbcGFyYW1dLCAnKCcsIHZhcmlhYmxlLCAnKTsnLFxyXG4gICAgICAgICAgdmFyaWFibGUubWFwKGZ1bmN0aW9uICh2LCBpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBDVVJSRU5UICsgJ1snICsgaSArICddPScgKyB2XHJcbiAgICAgICAgICB9KS5qb2luKCc7JyksICc7Jyk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgc2NvcGUoXHJcbiAgICAgICAgICBHTCwgJy4nLCBHTF9WQVJJQUJMRVNbcGFyYW1dLCAnKCcsIHZhcmlhYmxlLCAnKTsnLFxyXG4gICAgICAgICAgQ1VSUkVOVF9TVEFURSwgJy4nLCBwYXJhbSwgJz0nLCB2YXJpYWJsZSwgJzsnKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBpbmplY3RFeHRlbnNpb25zIChlbnYsIHNjb3BlKSB7XHJcbiAgICBpZiAoZXh0SW5zdGFuY2luZykge1xyXG4gICAgICBlbnYuaW5zdGFuY2luZyA9IHNjb3BlLmRlZihcclxuICAgICAgICBlbnYuc2hhcmVkLmV4dGVuc2lvbnMsICcuYW5nbGVfaW5zdGFuY2VkX2FycmF5cycpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZW1pdFByb2ZpbGUgKGVudiwgc2NvcGUsIGFyZ3MsIHVzZVNjb3BlLCBpbmNyZW1lbnRDb3VudGVyKSB7XHJcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZDtcclxuICAgIHZhciBTVEFUUyA9IGVudi5zdGF0cztcclxuICAgIHZhciBDVVJSRU5UX1NUQVRFID0gc2hhcmVkLmN1cnJlbnQ7XHJcbiAgICB2YXIgVElNRVIgPSBzaGFyZWQudGltZXI7XHJcbiAgICB2YXIgcHJvZmlsZUFyZyA9IGFyZ3MucHJvZmlsZTtcclxuXHJcbiAgICBmdW5jdGlvbiBwZXJmQ291bnRlciAoKSB7XHJcbiAgICAgIGlmICh0eXBlb2YgcGVyZm9ybWFuY2UgPT09ICd1bmRlZmluZWQnKSB7XHJcbiAgICAgICAgcmV0dXJuICdEYXRlLm5vdygpJ1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHJldHVybiAncGVyZm9ybWFuY2Uubm93KCknXHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB2YXIgQ1BVX1NUQVJULCBRVUVSWV9DT1VOVEVSO1xyXG4gICAgZnVuY3Rpb24gZW1pdFByb2ZpbGVTdGFydCAoYmxvY2spIHtcclxuICAgICAgQ1BVX1NUQVJUID0gc2NvcGUuZGVmKCk7XHJcbiAgICAgIGJsb2NrKENQVV9TVEFSVCwgJz0nLCBwZXJmQ291bnRlcigpLCAnOycpO1xyXG4gICAgICBpZiAodHlwZW9mIGluY3JlbWVudENvdW50ZXIgPT09ICdzdHJpbmcnKSB7XHJcbiAgICAgICAgYmxvY2soU1RBVFMsICcuY291bnQrPScsIGluY3JlbWVudENvdW50ZXIsICc7Jyk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgYmxvY2soU1RBVFMsICcuY291bnQrKzsnKTtcclxuICAgICAgfVxyXG4gICAgICBpZiAodGltZXIpIHtcclxuICAgICAgICBpZiAodXNlU2NvcGUpIHtcclxuICAgICAgICAgIFFVRVJZX0NPVU5URVIgPSBzY29wZS5kZWYoKTtcclxuICAgICAgICAgIGJsb2NrKFFVRVJZX0NPVU5URVIsICc9JywgVElNRVIsICcuZ2V0TnVtUGVuZGluZ1F1ZXJpZXMoKTsnKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgYmxvY2soVElNRVIsICcuYmVnaW5RdWVyeSgnLCBTVEFUUywgJyk7Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZW1pdFByb2ZpbGVFbmQgKGJsb2NrKSB7XHJcbiAgICAgIGJsb2NrKFNUQVRTLCAnLmNwdVRpbWUrPScsIHBlcmZDb3VudGVyKCksICctJywgQ1BVX1NUQVJULCAnOycpO1xyXG4gICAgICBpZiAodGltZXIpIHtcclxuICAgICAgICBpZiAodXNlU2NvcGUpIHtcclxuICAgICAgICAgIGJsb2NrKFRJTUVSLCAnLnB1c2hTY29wZVN0YXRzKCcsXHJcbiAgICAgICAgICAgIFFVRVJZX0NPVU5URVIsICcsJyxcclxuICAgICAgICAgICAgVElNRVIsICcuZ2V0TnVtUGVuZGluZ1F1ZXJpZXMoKSwnLFxyXG4gICAgICAgICAgICBTVEFUUywgJyk7Jyk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGJsb2NrKFRJTUVSLCAnLmVuZFF1ZXJ5KCk7Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gc2NvcGVQcm9maWxlICh2YWx1ZSkge1xyXG4gICAgICB2YXIgcHJldiA9IHNjb3BlLmRlZihDVVJSRU5UX1NUQVRFLCAnLnByb2ZpbGUnKTtcclxuICAgICAgc2NvcGUoQ1VSUkVOVF9TVEFURSwgJy5wcm9maWxlPScsIHZhbHVlLCAnOycpO1xyXG4gICAgICBzY29wZS5leGl0KENVUlJFTlRfU1RBVEUsICcucHJvZmlsZT0nLCBwcmV2LCAnOycpO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBVU0VfUFJPRklMRTtcclxuICAgIGlmIChwcm9maWxlQXJnKSB7XHJcbiAgICAgIGlmIChpc1N0YXRpYyhwcm9maWxlQXJnKSkge1xyXG4gICAgICAgIGlmIChwcm9maWxlQXJnLmVuYWJsZSkge1xyXG4gICAgICAgICAgZW1pdFByb2ZpbGVTdGFydChzY29wZSk7XHJcbiAgICAgICAgICBlbWl0UHJvZmlsZUVuZChzY29wZS5leGl0KTtcclxuICAgICAgICAgIHNjb3BlUHJvZmlsZSgndHJ1ZScpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBzY29wZVByb2ZpbGUoJ2ZhbHNlJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVyblxyXG4gICAgICB9XHJcbiAgICAgIFVTRV9QUk9GSUxFID0gcHJvZmlsZUFyZy5hcHBlbmQoZW52LCBzY29wZSk7XHJcbiAgICAgIHNjb3BlUHJvZmlsZShVU0VfUFJPRklMRSk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBVU0VfUFJPRklMRSA9IHNjb3BlLmRlZihDVVJSRU5UX1NUQVRFLCAnLnByb2ZpbGUnKTtcclxuICAgIH1cclxuXHJcbiAgICB2YXIgc3RhcnQgPSBlbnYuYmxvY2soKTtcclxuICAgIGVtaXRQcm9maWxlU3RhcnQoc3RhcnQpO1xyXG4gICAgc2NvcGUoJ2lmKCcsIFVTRV9QUk9GSUxFLCAnKXsnLCBzdGFydCwgJ30nKTtcclxuICAgIHZhciBlbmQgPSBlbnYuYmxvY2soKTtcclxuICAgIGVtaXRQcm9maWxlRW5kKGVuZCk7XHJcbiAgICBzY29wZS5leGl0KCdpZignLCBVU0VfUFJPRklMRSwgJyl7JywgZW5kLCAnfScpO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZW1pdEF0dHJpYnV0ZXMgKGVudiwgc2NvcGUsIGFyZ3MsIGF0dHJpYnV0ZXMsIGZpbHRlcikge1xyXG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWQ7XHJcblxyXG4gICAgZnVuY3Rpb24gdHlwZUxlbmd0aCAoeCkge1xyXG4gICAgICBzd2l0Y2ggKHgpIHtcclxuICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzI6XHJcbiAgICAgICAgY2FzZSBHTF9JTlRfVkVDMjpcclxuICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMjpcclxuICAgICAgICAgIHJldHVybiAyXHJcbiAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMzOlxyXG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzM6XHJcbiAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzM6XHJcbiAgICAgICAgICByZXR1cm4gM1xyXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDNDpcclxuICAgICAgICBjYXNlIEdMX0lOVF9WRUM0OlxyXG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUM0OlxyXG4gICAgICAgICAgcmV0dXJuIDRcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgcmV0dXJuIDFcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGVtaXRCaW5kQXR0cmlidXRlIChBVFRSSUJVVEUsIHNpemUsIHJlY29yZCkge1xyXG4gICAgICB2YXIgR0wgPSBzaGFyZWQuZ2w7XHJcblxyXG4gICAgICB2YXIgTE9DQVRJT04gPSBzY29wZS5kZWYoQVRUUklCVVRFLCAnLmxvY2F0aW9uJyk7XHJcbiAgICAgIHZhciBCSU5ESU5HID0gc2NvcGUuZGVmKHNoYXJlZC5hdHRyaWJ1dGVzLCAnWycsIExPQ0FUSU9OLCAnXScpO1xyXG5cclxuICAgICAgdmFyIFNUQVRFID0gcmVjb3JkLnN0YXRlO1xyXG4gICAgICB2YXIgQlVGRkVSID0gcmVjb3JkLmJ1ZmZlcjtcclxuICAgICAgdmFyIENPTlNUX0NPTVBPTkVOVFMgPSBbXHJcbiAgICAgICAgcmVjb3JkLngsXHJcbiAgICAgICAgcmVjb3JkLnksXHJcbiAgICAgICAgcmVjb3JkLnosXHJcbiAgICAgICAgcmVjb3JkLndcclxuICAgICAgXTtcclxuXHJcbiAgICAgIHZhciBDT01NT05fS0VZUyA9IFtcclxuICAgICAgICAnYnVmZmVyJyxcclxuICAgICAgICAnbm9ybWFsaXplZCcsXHJcbiAgICAgICAgJ29mZnNldCcsXHJcbiAgICAgICAgJ3N0cmlkZSdcclxuICAgICAgXTtcclxuXHJcbiAgICAgIGZ1bmN0aW9uIGVtaXRCdWZmZXIgKCkge1xyXG4gICAgICAgIHNjb3BlKFxyXG4gICAgICAgICAgJ2lmKCEnLCBCSU5ESU5HLCAnLmJ1ZmZlcil7JyxcclxuICAgICAgICAgIEdMLCAnLmVuYWJsZVZlcnRleEF0dHJpYkFycmF5KCcsIExPQ0FUSU9OLCAnKTt9Jyk7XHJcblxyXG4gICAgICAgIHZhciBUWVBFID0gcmVjb3JkLnR5cGU7XHJcbiAgICAgICAgdmFyIFNJWkU7XHJcbiAgICAgICAgaWYgKCFyZWNvcmQuc2l6ZSkge1xyXG4gICAgICAgICAgU0laRSA9IHNpemU7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIFNJWkUgPSBzY29wZS5kZWYocmVjb3JkLnNpemUsICd8fCcsIHNpemUpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgc2NvcGUoJ2lmKCcsXHJcbiAgICAgICAgICBCSU5ESU5HLCAnLnR5cGUhPT0nLCBUWVBFLCAnfHwnLFxyXG4gICAgICAgICAgQklORElORywgJy5zaXplIT09JywgU0laRSwgJ3x8JyxcclxuICAgICAgICAgIENPTU1PTl9LRVlTLm1hcChmdW5jdGlvbiAoa2V5KSB7XHJcbiAgICAgICAgICAgIHJldHVybiBCSU5ESU5HICsgJy4nICsga2V5ICsgJyE9PScgKyByZWNvcmRba2V5XVxyXG4gICAgICAgICAgfSkuam9pbignfHwnKSxcclxuICAgICAgICAgICcpeycsXHJcbiAgICAgICAgICBHTCwgJy5iaW5kQnVmZmVyKCcsIEdMX0FSUkFZX0JVRkZFUiQxLCAnLCcsIEJVRkZFUiwgJy5idWZmZXIpOycsXHJcbiAgICAgICAgICBHTCwgJy52ZXJ0ZXhBdHRyaWJQb2ludGVyKCcsIFtcclxuICAgICAgICAgICAgTE9DQVRJT04sXHJcbiAgICAgICAgICAgIFNJWkUsXHJcbiAgICAgICAgICAgIFRZUEUsXHJcbiAgICAgICAgICAgIHJlY29yZC5ub3JtYWxpemVkLFxyXG4gICAgICAgICAgICByZWNvcmQuc3RyaWRlLFxyXG4gICAgICAgICAgICByZWNvcmQub2Zmc2V0XHJcbiAgICAgICAgICBdLCAnKTsnLFxyXG4gICAgICAgICAgQklORElORywgJy50eXBlPScsIFRZUEUsICc7JyxcclxuICAgICAgICAgIEJJTkRJTkcsICcuc2l6ZT0nLCBTSVpFLCAnOycsXHJcbiAgICAgICAgICBDT01NT05fS0VZUy5tYXAoZnVuY3Rpb24gKGtleSkge1xyXG4gICAgICAgICAgICByZXR1cm4gQklORElORyArICcuJyArIGtleSArICc9JyArIHJlY29yZFtrZXldICsgJzsnXHJcbiAgICAgICAgICB9KS5qb2luKCcnKSxcclxuICAgICAgICAgICd9Jyk7XHJcblxyXG4gICAgICAgIGlmIChleHRJbnN0YW5jaW5nKSB7XHJcbiAgICAgICAgICB2YXIgRElWSVNPUiA9IHJlY29yZC5kaXZpc29yO1xyXG4gICAgICAgICAgc2NvcGUoXHJcbiAgICAgICAgICAgICdpZignLCBCSU5ESU5HLCAnLmRpdmlzb3IhPT0nLCBESVZJU09SLCAnKXsnLFxyXG4gICAgICAgICAgICBlbnYuaW5zdGFuY2luZywgJy52ZXJ0ZXhBdHRyaWJEaXZpc29yQU5HTEUoJywgW0xPQ0FUSU9OLCBESVZJU09SXSwgJyk7JyxcclxuICAgICAgICAgICAgQklORElORywgJy5kaXZpc29yPScsIERJVklTT1IsICc7fScpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgZnVuY3Rpb24gZW1pdENvbnN0YW50ICgpIHtcclxuICAgICAgICBzY29wZShcclxuICAgICAgICAgICdpZignLCBCSU5ESU5HLCAnLmJ1ZmZlcil7JyxcclxuICAgICAgICAgIEdMLCAnLmRpc2FibGVWZXJ0ZXhBdHRyaWJBcnJheSgnLCBMT0NBVElPTiwgJyk7JyxcclxuICAgICAgICAgICd9aWYoJywgQ1VURV9DT01QT05FTlRTLm1hcChmdW5jdGlvbiAoYywgaSkge1xyXG4gICAgICAgICAgICByZXR1cm4gQklORElORyArICcuJyArIGMgKyAnIT09JyArIENPTlNUX0NPTVBPTkVOVFNbaV1cclxuICAgICAgICAgIH0pLmpvaW4oJ3x8JyksICcpeycsXHJcbiAgICAgICAgICBHTCwgJy52ZXJ0ZXhBdHRyaWI0ZignLCBMT0NBVElPTiwgJywnLCBDT05TVF9DT01QT05FTlRTLCAnKTsnLFxyXG4gICAgICAgICAgQ1VURV9DT01QT05FTlRTLm1hcChmdW5jdGlvbiAoYywgaSkge1xyXG4gICAgICAgICAgICByZXR1cm4gQklORElORyArICcuJyArIGMgKyAnPScgKyBDT05TVF9DT01QT05FTlRTW2ldICsgJzsnXHJcbiAgICAgICAgICB9KS5qb2luKCcnKSxcclxuICAgICAgICAgICd9Jyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmIChTVEFURSA9PT0gQVRUUklCX1NUQVRFX1BPSU5URVIpIHtcclxuICAgICAgICBlbWl0QnVmZmVyKCk7XHJcbiAgICAgIH0gZWxzZSBpZiAoU1RBVEUgPT09IEFUVFJJQl9TVEFURV9DT05TVEFOVCkge1xyXG4gICAgICAgIGVtaXRDb25zdGFudCgpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHNjb3BlKCdpZignLCBTVEFURSwgJz09PScsIEFUVFJJQl9TVEFURV9QT0lOVEVSLCAnKXsnKTtcclxuICAgICAgICBlbWl0QnVmZmVyKCk7XHJcbiAgICAgICAgc2NvcGUoJ31lbHNleycpO1xyXG4gICAgICAgIGVtaXRDb25zdGFudCgpO1xyXG4gICAgICAgIHNjb3BlKCd9Jyk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBhdHRyaWJ1dGVzLmZvckVhY2goZnVuY3Rpb24gKGF0dHJpYnV0ZSkge1xyXG4gICAgICB2YXIgbmFtZSA9IGF0dHJpYnV0ZS5uYW1lO1xyXG4gICAgICB2YXIgYXJnID0gYXJncy5hdHRyaWJ1dGVzW25hbWVdO1xyXG4gICAgICB2YXIgcmVjb3JkO1xyXG4gICAgICBpZiAoYXJnKSB7XHJcbiAgICAgICAgaWYgKCFmaWx0ZXIoYXJnKSkge1xyXG4gICAgICAgICAgcmV0dXJuXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJlY29yZCA9IGFyZy5hcHBlbmQoZW52LCBzY29wZSk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgaWYgKCFmaWx0ZXIoU0NPUEVfREVDTCkpIHtcclxuICAgICAgICAgIHJldHVyblxyXG4gICAgICAgIH1cclxuICAgICAgICB2YXIgc2NvcGVBdHRyaWIgPSBlbnYuc2NvcGVBdHRyaWIobmFtZSk7XHJcbiAgICAgICAgY2hlY2skMS5vcHRpb25hbChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICBlbnYuYXNzZXJ0KHNjb3BlLFxyXG4gICAgICAgICAgICBzY29wZUF0dHJpYiArICcuc3RhdGUnLFxyXG4gICAgICAgICAgICAnbWlzc2luZyBhdHRyaWJ1dGUgJyArIG5hbWUpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJlY29yZCA9IHt9O1xyXG4gICAgICAgIE9iamVjdC5rZXlzKG5ldyBBdHRyaWJ1dGVSZWNvcmQoKSkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XHJcbiAgICAgICAgICByZWNvcmRba2V5XSA9IHNjb3BlLmRlZihzY29wZUF0dHJpYiwgJy4nLCBrZXkpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICAgIGVtaXRCaW5kQXR0cmlidXRlKFxyXG4gICAgICAgIGVudi5saW5rKGF0dHJpYnV0ZSksIHR5cGVMZW5ndGgoYXR0cmlidXRlLmluZm8udHlwZSksIHJlY29yZCk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGVtaXRVbmlmb3JtcyAoZW52LCBzY29wZSwgYXJncywgdW5pZm9ybXMsIGZpbHRlcikge1xyXG4gICAgdmFyIHNoYXJlZCA9IGVudi5zaGFyZWQ7XHJcbiAgICB2YXIgR0wgPSBzaGFyZWQuZ2w7XHJcblxyXG4gICAgdmFyIGluZml4O1xyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB1bmlmb3Jtcy5sZW5ndGg7ICsraSkge1xyXG4gICAgICB2YXIgdW5pZm9ybSA9IHVuaWZvcm1zW2ldO1xyXG4gICAgICB2YXIgbmFtZSA9IHVuaWZvcm0ubmFtZTtcclxuICAgICAgdmFyIHR5cGUgPSB1bmlmb3JtLmluZm8udHlwZTtcclxuICAgICAgdmFyIGFyZyA9IGFyZ3MudW5pZm9ybXNbbmFtZV07XHJcbiAgICAgIHZhciBVTklGT1JNID0gZW52LmxpbmsodW5pZm9ybSk7XHJcbiAgICAgIHZhciBMT0NBVElPTiA9IFVOSUZPUk0gKyAnLmxvY2F0aW9uJztcclxuXHJcbiAgICAgIHZhciBWQUxVRTtcclxuICAgICAgaWYgKGFyZykge1xyXG4gICAgICAgIGlmICghZmlsdGVyKGFyZykpIHtcclxuICAgICAgICAgIGNvbnRpbnVlXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChpc1N0YXRpYyhhcmcpKSB7XHJcbiAgICAgICAgICB2YXIgdmFsdWUgPSBhcmcudmFsdWU7XHJcbiAgICAgICAgICBjaGVjayQxLmNvbW1hbmQoXHJcbiAgICAgICAgICAgIHZhbHVlICE9PSBudWxsICYmIHR5cGVvZiB2YWx1ZSAhPT0gJ3VuZGVmaW5lZCcsXHJcbiAgICAgICAgICAgICdtaXNzaW5nIHVuaWZvcm0gXCInICsgbmFtZSArICdcIicsIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgIGlmICh0eXBlID09PSBHTF9TQU1QTEVSXzJEIHx8IHR5cGUgPT09IEdMX1NBTVBMRVJfQ1VCRSkge1xyXG4gICAgICAgICAgICBjaGVjayQxLmNvbW1hbmQoXHJcbiAgICAgICAgICAgICAgdHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nICYmXHJcbiAgICAgICAgICAgICAgKCh0eXBlID09PSBHTF9TQU1QTEVSXzJEICYmXHJcbiAgICAgICAgICAgICAgICAodmFsdWUuX3JlZ2xUeXBlID09PSAndGV4dHVyZTJkJyB8fFxyXG4gICAgICAgICAgICAgICAgdmFsdWUuX3JlZ2xUeXBlID09PSAnZnJhbWVidWZmZXInKSkgfHxcclxuICAgICAgICAgICAgICAodHlwZSA9PT0gR0xfU0FNUExFUl9DVUJFICYmXHJcbiAgICAgICAgICAgICAgICAodmFsdWUuX3JlZ2xUeXBlID09PSAndGV4dHVyZUN1YmUnIHx8XHJcbiAgICAgICAgICAgICAgICB2YWx1ZS5fcmVnbFR5cGUgPT09ICdmcmFtZWJ1ZmZlckN1YmUnKSkpLFxyXG4gICAgICAgICAgICAgICdpbnZhbGlkIHRleHR1cmUgZm9yIHVuaWZvcm0gJyArIG5hbWUsIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgdmFyIFRFWF9WQUxVRSA9IGVudi5saW5rKHZhbHVlLl90ZXh0dXJlIHx8IHZhbHVlLmNvbG9yWzBdLl90ZXh0dXJlKTtcclxuICAgICAgICAgICAgc2NvcGUoR0wsICcudW5pZm9ybTFpKCcsIExPQ0FUSU9OLCAnLCcsIFRFWF9WQUxVRSArICcuYmluZCgpKTsnKTtcclxuICAgICAgICAgICAgc2NvcGUuZXhpdChURVhfVkFMVUUsICcudW5iaW5kKCk7Jyk7XHJcbiAgICAgICAgICB9IGVsc2UgaWYgKFxyXG4gICAgICAgICAgICB0eXBlID09PSBHTF9GTE9BVF9NQVQyIHx8XHJcbiAgICAgICAgICAgIHR5cGUgPT09IEdMX0ZMT0FUX01BVDMgfHxcclxuICAgICAgICAgICAgdHlwZSA9PT0gR0xfRkxPQVRfTUFUNCkge1xyXG4gICAgICAgICAgICBjaGVjayQxLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmQoaXNBcnJheUxpa2UodmFsdWUpLFxyXG4gICAgICAgICAgICAgICAgJ2ludmFsaWQgbWF0cml4IGZvciB1bmlmb3JtICcgKyBuYW1lLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kKFxyXG4gICAgICAgICAgICAgICAgKHR5cGUgPT09IEdMX0ZMT0FUX01BVDIgJiYgdmFsdWUubGVuZ3RoID09PSA0KSB8fFxyXG4gICAgICAgICAgICAgICAgKHR5cGUgPT09IEdMX0ZMT0FUX01BVDMgJiYgdmFsdWUubGVuZ3RoID09PSA5KSB8fFxyXG4gICAgICAgICAgICAgICAgKHR5cGUgPT09IEdMX0ZMT0FUX01BVDQgJiYgdmFsdWUubGVuZ3RoID09PSAxNiksXHJcbiAgICAgICAgICAgICAgICAnaW52YWxpZCBsZW5ndGggZm9yIG1hdHJpeCB1bmlmb3JtICcgKyBuYW1lLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB2YXIgTUFUX1ZBTFVFID0gZW52Lmdsb2JhbC5kZWYoJ25ldyBGbG9hdDMyQXJyYXkoWycgK1xyXG4gICAgICAgICAgICAgIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHZhbHVlKSArICddKScpO1xyXG4gICAgICAgICAgICB2YXIgZGltID0gMjtcclxuICAgICAgICAgICAgaWYgKHR5cGUgPT09IEdMX0ZMT0FUX01BVDMpIHtcclxuICAgICAgICAgICAgICBkaW0gPSAzO1xyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09IEdMX0ZMT0FUX01BVDQpIHtcclxuICAgICAgICAgICAgICBkaW0gPSA0O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHNjb3BlKFxyXG4gICAgICAgICAgICAgIEdMLCAnLnVuaWZvcm1NYXRyaXgnLCBkaW0sICdmdignLFxyXG4gICAgICAgICAgICAgIExPQ0FUSU9OLCAnLGZhbHNlLCcsIE1BVF9WQUxVRSwgJyk7Jyk7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBzd2l0Y2ggKHR5cGUpIHtcclxuICAgICAgICAgICAgICBjYXNlIEdMX0ZMT0FUJDg6XHJcbiAgICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmRUeXBlKHZhbHVlLCAnbnVtYmVyJywgJ3VuaWZvcm0gJyArIG5hbWUsIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgICAgIGluZml4ID0gJzFmJztcclxuICAgICAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMyOlxyXG4gICAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kKFxyXG4gICAgICAgICAgICAgICAgICBpc0FycmF5TGlrZSh2YWx1ZSkgJiYgdmFsdWUubGVuZ3RoID09PSAyLFxyXG4gICAgICAgICAgICAgICAgICAndW5pZm9ybSAnICsgbmFtZSwgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgICAgaW5maXggPSAnMmYnO1xyXG4gICAgICAgICAgICAgICAgYnJlYWtcclxuICAgICAgICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzM6XHJcbiAgICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmQoXHJcbiAgICAgICAgICAgICAgICAgIGlzQXJyYXlMaWtlKHZhbHVlKSAmJiB2YWx1ZS5sZW5ndGggPT09IDMsXHJcbiAgICAgICAgICAgICAgICAgICd1bmlmb3JtICcgKyBuYW1lLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICczZic7XHJcbiAgICAgICAgICAgICAgICBicmVha1xyXG4gICAgICAgICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDNDpcclxuICAgICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZChcclxuICAgICAgICAgICAgICAgICAgaXNBcnJheUxpa2UodmFsdWUpICYmIHZhbHVlLmxlbmd0aCA9PT0gNCxcclxuICAgICAgICAgICAgICAgICAgJ3VuaWZvcm0gJyArIG5hbWUsIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgICAgIGluZml4ID0gJzRmJztcclxuICAgICAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgICAgICAgY2FzZSBHTF9CT09MOlxyXG4gICAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kVHlwZSh2YWx1ZSwgJ2Jvb2xlYW4nLCAndW5pZm9ybSAnICsgbmFtZSwgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgICAgaW5maXggPSAnMWknO1xyXG4gICAgICAgICAgICAgICAgYnJlYWtcclxuICAgICAgICAgICAgICBjYXNlIEdMX0lOVCQzOlxyXG4gICAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kVHlwZSh2YWx1ZSwgJ251bWJlcicsICd1bmlmb3JtICcgKyBuYW1lLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICcxaSc7XHJcbiAgICAgICAgICAgICAgICBicmVha1xyXG4gICAgICAgICAgICAgIGNhc2UgR0xfQk9PTF9WRUMyOlxyXG4gICAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kKFxyXG4gICAgICAgICAgICAgICAgICBpc0FycmF5TGlrZSh2YWx1ZSkgJiYgdmFsdWUubGVuZ3RoID09PSAyLFxyXG4gICAgICAgICAgICAgICAgICAndW5pZm9ybSAnICsgbmFtZSwgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgICAgaW5maXggPSAnMmknO1xyXG4gICAgICAgICAgICAgICAgYnJlYWtcclxuICAgICAgICAgICAgICBjYXNlIEdMX0lOVF9WRUMyOlxyXG4gICAgICAgICAgICAgICAgY2hlY2skMS5jb21tYW5kKFxyXG4gICAgICAgICAgICAgICAgICBpc0FycmF5TGlrZSh2YWx1ZSkgJiYgdmFsdWUubGVuZ3RoID09PSAyLFxyXG4gICAgICAgICAgICAgICAgICAndW5pZm9ybSAnICsgbmFtZSwgZW52LmNvbW1hbmRTdHIpO1xyXG4gICAgICAgICAgICAgICAgaW5maXggPSAnMmknO1xyXG4gICAgICAgICAgICAgICAgYnJlYWtcclxuICAgICAgICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMzpcclxuICAgICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZChcclxuICAgICAgICAgICAgICAgICAgaXNBcnJheUxpa2UodmFsdWUpICYmIHZhbHVlLmxlbmd0aCA9PT0gMyxcclxuICAgICAgICAgICAgICAgICAgJ3VuaWZvcm0gJyArIG5hbWUsIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgICAgIGluZml4ID0gJzNpJztcclxuICAgICAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgICAgICAgY2FzZSBHTF9JTlRfVkVDMzpcclxuICAgICAgICAgICAgICAgIGNoZWNrJDEuY29tbWFuZChcclxuICAgICAgICAgICAgICAgICAgaXNBcnJheUxpa2UodmFsdWUpICYmIHZhbHVlLmxlbmd0aCA9PT0gMyxcclxuICAgICAgICAgICAgICAgICAgJ3VuaWZvcm0gJyArIG5hbWUsIGVudi5jb21tYW5kU3RyKTtcclxuICAgICAgICAgICAgICAgIGluZml4ID0gJzNpJztcclxuICAgICAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzQ6XHJcbiAgICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmQoXHJcbiAgICAgICAgICAgICAgICAgIGlzQXJyYXlMaWtlKHZhbHVlKSAmJiB2YWx1ZS5sZW5ndGggPT09IDQsXHJcbiAgICAgICAgICAgICAgICAgICd1bmlmb3JtICcgKyBuYW1lLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICc0aSc7XHJcbiAgICAgICAgICAgICAgICBicmVha1xyXG4gICAgICAgICAgICAgIGNhc2UgR0xfSU5UX1ZFQzQ6XHJcbiAgICAgICAgICAgICAgICBjaGVjayQxLmNvbW1hbmQoXHJcbiAgICAgICAgICAgICAgICAgIGlzQXJyYXlMaWtlKHZhbHVlKSAmJiB2YWx1ZS5sZW5ndGggPT09IDQsXHJcbiAgICAgICAgICAgICAgICAgICd1bmlmb3JtICcgKyBuYW1lLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgICAgICAgICBpbmZpeCA9ICc0aSc7XHJcbiAgICAgICAgICAgICAgICBicmVha1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHNjb3BlKEdMLCAnLnVuaWZvcm0nLCBpbmZpeCwgJygnLCBMT0NBVElPTiwgJywnLFxyXG4gICAgICAgICAgICAgIGlzQXJyYXlMaWtlKHZhbHVlKSA/IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHZhbHVlKSA6IHZhbHVlLFxyXG4gICAgICAgICAgICAgICcpOycpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgY29udGludWVcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgVkFMVUUgPSBhcmcuYXBwZW5kKGVudiwgc2NvcGUpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBpZiAoIWZpbHRlcihTQ09QRV9ERUNMKSkge1xyXG4gICAgICAgICAgY29udGludWVcclxuICAgICAgICB9XHJcbiAgICAgICAgVkFMVUUgPSBzY29wZS5kZWYoc2hhcmVkLnVuaWZvcm1zLCAnWycsIHN0cmluZ1N0b3JlLmlkKG5hbWUpLCAnXScpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAodHlwZSA9PT0gR0xfU0FNUExFUl8yRCkge1xyXG4gICAgICAgIHNjb3BlKFxyXG4gICAgICAgICAgJ2lmKCcsIFZBTFVFLCAnJiYnLCBWQUxVRSwgJy5fcmVnbFR5cGU9PT1cImZyYW1lYnVmZmVyXCIpeycsXHJcbiAgICAgICAgICBWQUxVRSwgJz0nLCBWQUxVRSwgJy5jb2xvclswXTsnLFxyXG4gICAgICAgICAgJ30nKTtcclxuICAgICAgfSBlbHNlIGlmICh0eXBlID09PSBHTF9TQU1QTEVSX0NVQkUpIHtcclxuICAgICAgICBzY29wZShcclxuICAgICAgICAgICdpZignLCBWQUxVRSwgJyYmJywgVkFMVUUsICcuX3JlZ2xUeXBlPT09XCJmcmFtZWJ1ZmZlckN1YmVcIil7JyxcclxuICAgICAgICAgIFZBTFVFLCAnPScsIFZBTFVFLCAnLmNvbG9yWzBdOycsXHJcbiAgICAgICAgICAnfScpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBwZXJmb3JtIHR5cGUgdmFsaWRhdGlvblxyXG4gICAgICBjaGVjayQxLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICBmdW5jdGlvbiBjaGVjayAocHJlZCwgbWVzc2FnZSkge1xyXG4gICAgICAgICAgZW52LmFzc2VydChzY29wZSwgcHJlZCxcclxuICAgICAgICAgICAgJ2JhZCBkYXRhIG9yIG1pc3NpbmcgZm9yIHVuaWZvcm0gXCInICsgbmFtZSArICdcIi4gICcgKyBtZXNzYWdlKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGZ1bmN0aW9uIGNoZWNrVHlwZSAodHlwZSkge1xyXG4gICAgICAgICAgY2hlY2soXHJcbiAgICAgICAgICAgICd0eXBlb2YgJyArIFZBTFVFICsgJz09PVwiJyArIHR5cGUgKyAnXCInLFxyXG4gICAgICAgICAgICAnaW52YWxpZCB0eXBlLCBleHBlY3RlZCAnICsgdHlwZSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBmdW5jdGlvbiBjaGVja1ZlY3RvciAobiwgdHlwZSkge1xyXG4gICAgICAgICAgY2hlY2soXHJcbiAgICAgICAgICAgIHNoYXJlZC5pc0FycmF5TGlrZSArICcoJyArIFZBTFVFICsgJykmJicgKyBWQUxVRSArICcubGVuZ3RoPT09JyArIG4sXHJcbiAgICAgICAgICAgICdpbnZhbGlkIHZlY3Rvciwgc2hvdWxkIGhhdmUgbGVuZ3RoICcgKyBuLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBmdW5jdGlvbiBjaGVja1RleHR1cmUgKHRhcmdldCkge1xyXG4gICAgICAgICAgY2hlY2soXHJcbiAgICAgICAgICAgICd0eXBlb2YgJyArIFZBTFVFICsgJz09PVwiZnVuY3Rpb25cIiYmJyArXHJcbiAgICAgICAgICAgIFZBTFVFICsgJy5fcmVnbFR5cGU9PT1cInRleHR1cmUnICtcclxuICAgICAgICAgICAgKHRhcmdldCA9PT0gR0xfVEVYVFVSRV8yRCQzID8gJzJkJyA6ICdDdWJlJykgKyAnXCInLFxyXG4gICAgICAgICAgICAnaW52YWxpZCB0ZXh0dXJlIHR5cGUnLCBlbnYuY29tbWFuZFN0cik7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBzd2l0Y2ggKHR5cGUpIHtcclxuICAgICAgICAgIGNhc2UgR0xfSU5UJDM6XHJcbiAgICAgICAgICAgIGNoZWNrVHlwZSgnbnVtYmVyJyk7XHJcbiAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgICBjYXNlIEdMX0lOVF9WRUMyOlxyXG4gICAgICAgICAgICBjaGVja1ZlY3RvcigyLCAnbnVtYmVyJyk7XHJcbiAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgICBjYXNlIEdMX0lOVF9WRUMzOlxyXG4gICAgICAgICAgICBjaGVja1ZlY3RvcigzLCAnbnVtYmVyJyk7XHJcbiAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgICBjYXNlIEdMX0lOVF9WRUM0OlxyXG4gICAgICAgICAgICBjaGVja1ZlY3Rvcig0LCAnbnVtYmVyJyk7XHJcbiAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgICBjYXNlIEdMX0ZMT0FUJDg6XHJcbiAgICAgICAgICAgIGNoZWNrVHlwZSgnbnVtYmVyJyk7XHJcbiAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzI6XHJcbiAgICAgICAgICAgIGNoZWNrVmVjdG9yKDIsICdudW1iZXInKTtcclxuICAgICAgICAgICAgYnJlYWtcclxuICAgICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMzpcclxuICAgICAgICAgICAgY2hlY2tWZWN0b3IoMywgJ251bWJlcicpO1xyXG4gICAgICAgICAgICBicmVha1xyXG4gICAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUM0OlxyXG4gICAgICAgICAgICBjaGVja1ZlY3Rvcig0LCAnbnVtYmVyJyk7XHJcbiAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgICBjYXNlIEdMX0JPT0w6XHJcbiAgICAgICAgICAgIGNoZWNrVHlwZSgnYm9vbGVhbicpO1xyXG4gICAgICAgICAgICBicmVha1xyXG4gICAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzI6XHJcbiAgICAgICAgICAgIGNoZWNrVmVjdG9yKDIsICdib29sZWFuJyk7XHJcbiAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMzpcclxuICAgICAgICAgICAgY2hlY2tWZWN0b3IoMywgJ2Jvb2xlYW4nKTtcclxuICAgICAgICAgICAgYnJlYWtcclxuICAgICAgICAgIGNhc2UgR0xfQk9PTF9WRUM0OlxyXG4gICAgICAgICAgICBjaGVja1ZlY3Rvcig0LCAnYm9vbGVhbicpO1xyXG4gICAgICAgICAgICBicmVha1xyXG4gICAgICAgICAgY2FzZSBHTF9GTE9BVF9NQVQyOlxyXG4gICAgICAgICAgICBjaGVja1ZlY3Rvcig0LCAnbnVtYmVyJyk7XHJcbiAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgICBjYXNlIEdMX0ZMT0FUX01BVDM6XHJcbiAgICAgICAgICAgIGNoZWNrVmVjdG9yKDksICdudW1iZXInKTtcclxuICAgICAgICAgICAgYnJlYWtcclxuICAgICAgICAgIGNhc2UgR0xfRkxPQVRfTUFUNDpcclxuICAgICAgICAgICAgY2hlY2tWZWN0b3IoMTYsICdudW1iZXInKTtcclxuICAgICAgICAgICAgYnJlYWtcclxuICAgICAgICAgIGNhc2UgR0xfU0FNUExFUl8yRDpcclxuICAgICAgICAgICAgY2hlY2tUZXh0dXJlKEdMX1RFWFRVUkVfMkQkMyk7XHJcbiAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgICBjYXNlIEdMX1NBTVBMRVJfQ1VCRTpcclxuICAgICAgICAgICAgY2hlY2tUZXh0dXJlKEdMX1RFWFRVUkVfQ1VCRV9NQVAkMik7XHJcbiAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIHZhciB1bnJvbGwgPSAxO1xyXG4gICAgICBzd2l0Y2ggKHR5cGUpIHtcclxuICAgICAgICBjYXNlIEdMX1NBTVBMRVJfMkQ6XHJcbiAgICAgICAgY2FzZSBHTF9TQU1QTEVSX0NVQkU6XHJcbiAgICAgICAgICB2YXIgVEVYID0gc2NvcGUuZGVmKFZBTFVFLCAnLl90ZXh0dXJlJyk7XHJcbiAgICAgICAgICBzY29wZShHTCwgJy51bmlmb3JtMWkoJywgTE9DQVRJT04sICcsJywgVEVYLCAnLmJpbmQoKSk7Jyk7XHJcbiAgICAgICAgICBzY29wZS5leGl0KFRFWCwgJy51bmJpbmQoKTsnKTtcclxuICAgICAgICAgIGNvbnRpbnVlXHJcblxyXG4gICAgICAgIGNhc2UgR0xfSU5UJDM6XHJcbiAgICAgICAgY2FzZSBHTF9CT09MOlxyXG4gICAgICAgICAgaW5maXggPSAnMWknO1xyXG4gICAgICAgICAgYnJlYWtcclxuXHJcbiAgICAgICAgY2FzZSBHTF9JTlRfVkVDMjpcclxuICAgICAgICBjYXNlIEdMX0JPT0xfVkVDMjpcclxuICAgICAgICAgIGluZml4ID0gJzJpJztcclxuICAgICAgICAgIHVucm9sbCA9IDI7XHJcbiAgICAgICAgICBicmVha1xyXG5cclxuICAgICAgICBjYXNlIEdMX0lOVF9WRUMzOlxyXG4gICAgICAgIGNhc2UgR0xfQk9PTF9WRUMzOlxyXG4gICAgICAgICAgaW5maXggPSAnM2knO1xyXG4gICAgICAgICAgdW5yb2xsID0gMztcclxuICAgICAgICAgIGJyZWFrXHJcblxyXG4gICAgICAgIGNhc2UgR0xfSU5UX1ZFQzQ6XHJcbiAgICAgICAgY2FzZSBHTF9CT09MX1ZFQzQ6XHJcbiAgICAgICAgICBpbmZpeCA9ICc0aSc7XHJcbiAgICAgICAgICB1bnJvbGwgPSA0O1xyXG4gICAgICAgICAgYnJlYWtcclxuXHJcbiAgICAgICAgY2FzZSBHTF9GTE9BVCQ4OlxyXG4gICAgICAgICAgaW5maXggPSAnMWYnO1xyXG4gICAgICAgICAgYnJlYWtcclxuXHJcbiAgICAgICAgY2FzZSBHTF9GTE9BVF9WRUMyOlxyXG4gICAgICAgICAgaW5maXggPSAnMmYnO1xyXG4gICAgICAgICAgdW5yb2xsID0gMjtcclxuICAgICAgICAgIGJyZWFrXHJcblxyXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfVkVDMzpcclxuICAgICAgICAgIGluZml4ID0gJzNmJztcclxuICAgICAgICAgIHVucm9sbCA9IDM7XHJcbiAgICAgICAgICBicmVha1xyXG5cclxuICAgICAgICBjYXNlIEdMX0ZMT0FUX1ZFQzQ6XHJcbiAgICAgICAgICBpbmZpeCA9ICc0Zic7XHJcbiAgICAgICAgICB1bnJvbGwgPSA0O1xyXG4gICAgICAgICAgYnJlYWtcclxuXHJcbiAgICAgICAgY2FzZSBHTF9GTE9BVF9NQVQyOlxyXG4gICAgICAgICAgaW5maXggPSAnTWF0cml4MmZ2JztcclxuICAgICAgICAgIGJyZWFrXHJcblxyXG4gICAgICAgIGNhc2UgR0xfRkxPQVRfTUFUMzpcclxuICAgICAgICAgIGluZml4ID0gJ01hdHJpeDNmdic7XHJcbiAgICAgICAgICBicmVha1xyXG5cclxuICAgICAgICBjYXNlIEdMX0ZMT0FUX01BVDQ6XHJcbiAgICAgICAgICBpbmZpeCA9ICdNYXRyaXg0ZnYnO1xyXG4gICAgICAgICAgYnJlYWtcclxuICAgICAgfVxyXG5cclxuICAgICAgc2NvcGUoR0wsICcudW5pZm9ybScsIGluZml4LCAnKCcsIExPQ0FUSU9OLCAnLCcpO1xyXG4gICAgICBpZiAoaW5maXguY2hhckF0KDApID09PSAnTScpIHtcclxuICAgICAgICB2YXIgbWF0U2l6ZSA9IE1hdGgucG93KHR5cGUgLSBHTF9GTE9BVF9NQVQyICsgMiwgMik7XHJcbiAgICAgICAgdmFyIFNUT1JBR0UgPSBlbnYuZ2xvYmFsLmRlZignbmV3IEZsb2F0MzJBcnJheSgnLCBtYXRTaXplLCAnKScpO1xyXG4gICAgICAgIHNjb3BlKFxyXG4gICAgICAgICAgJ2ZhbHNlLChBcnJheS5pc0FycmF5KCcsIFZBTFVFLCAnKXx8JywgVkFMVUUsICcgaW5zdGFuY2VvZiBGbG9hdDMyQXJyYXkpPycsIFZBTFVFLCAnOignLFxyXG4gICAgICAgICAgbG9vcChtYXRTaXplLCBmdW5jdGlvbiAoaSkge1xyXG4gICAgICAgICAgICByZXR1cm4gU1RPUkFHRSArICdbJyArIGkgKyAnXT0nICsgVkFMVUUgKyAnWycgKyBpICsgJ10nXHJcbiAgICAgICAgICB9KSwgJywnLCBTVE9SQUdFLCAnKScpO1xyXG4gICAgICB9IGVsc2UgaWYgKHVucm9sbCA+IDEpIHtcclxuICAgICAgICBzY29wZShsb29wKHVucm9sbCwgZnVuY3Rpb24gKGkpIHtcclxuICAgICAgICAgIHJldHVybiBWQUxVRSArICdbJyArIGkgKyAnXSdcclxuICAgICAgICB9KSk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgc2NvcGUoVkFMVUUpO1xyXG4gICAgICB9XHJcbiAgICAgIHNjb3BlKCcpOycpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZW1pdERyYXcgKGVudiwgb3V0ZXIsIGlubmVyLCBhcmdzKSB7XHJcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZDtcclxuICAgIHZhciBHTCA9IHNoYXJlZC5nbDtcclxuICAgIHZhciBEUkFXX1NUQVRFID0gc2hhcmVkLmRyYXc7XHJcblxyXG4gICAgdmFyIGRyYXdPcHRpb25zID0gYXJncy5kcmF3O1xyXG5cclxuICAgIGZ1bmN0aW9uIGVtaXRFbGVtZW50cyAoKSB7XHJcbiAgICAgIHZhciBkZWZuID0gZHJhd09wdGlvbnMuZWxlbWVudHM7XHJcbiAgICAgIHZhciBFTEVNRU5UUztcclxuICAgICAgdmFyIHNjb3BlID0gb3V0ZXI7XHJcbiAgICAgIGlmIChkZWZuKSB7XHJcbiAgICAgICAgaWYgKChkZWZuLmNvbnRleHREZXAgJiYgYXJncy5jb250ZXh0RHluYW1pYykgfHwgZGVmbi5wcm9wRGVwKSB7XHJcbiAgICAgICAgICBzY29wZSA9IGlubmVyO1xyXG4gICAgICAgIH1cclxuICAgICAgICBFTEVNRU5UUyA9IGRlZm4uYXBwZW5kKGVudiwgc2NvcGUpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIEVMRU1FTlRTID0gc2NvcGUuZGVmKERSQVdfU1RBVEUsICcuJywgU19FTEVNRU5UUyk7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKEVMRU1FTlRTKSB7XHJcbiAgICAgICAgc2NvcGUoXHJcbiAgICAgICAgICAnaWYoJyArIEVMRU1FTlRTICsgJyknICtcclxuICAgICAgICAgIEdMICsgJy5iaW5kQnVmZmVyKCcgKyBHTF9FTEVNRU5UX0FSUkFZX0JVRkZFUiQxICsgJywnICsgRUxFTUVOVFMgKyAnLmJ1ZmZlci5idWZmZXIpOycpO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBFTEVNRU5UU1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGVtaXRDb3VudCAoKSB7XHJcbiAgICAgIHZhciBkZWZuID0gZHJhd09wdGlvbnMuY291bnQ7XHJcbiAgICAgIHZhciBDT1VOVDtcclxuICAgICAgdmFyIHNjb3BlID0gb3V0ZXI7XHJcbiAgICAgIGlmIChkZWZuKSB7XHJcbiAgICAgICAgaWYgKChkZWZuLmNvbnRleHREZXAgJiYgYXJncy5jb250ZXh0RHluYW1pYykgfHwgZGVmbi5wcm9wRGVwKSB7XHJcbiAgICAgICAgICBzY29wZSA9IGlubmVyO1xyXG4gICAgICAgIH1cclxuICAgICAgICBDT1VOVCA9IGRlZm4uYXBwZW5kKGVudiwgc2NvcGUpO1xyXG4gICAgICAgIGNoZWNrJDEub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgaWYgKGRlZm4uTUlTU0lORykge1xyXG4gICAgICAgICAgICBlbnYuYXNzZXJ0KG91dGVyLCAnZmFsc2UnLCAnbWlzc2luZyB2ZXJ0ZXggY291bnQnKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGlmIChkZWZuLkRZTkFNSUMpIHtcclxuICAgICAgICAgICAgZW52LmFzc2VydChzY29wZSwgQ09VTlQgKyAnPj0wJywgJ21pc3NpbmcgdmVydGV4IGNvdW50Jyk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgQ09VTlQgPSBzY29wZS5kZWYoRFJBV19TVEFURSwgJy4nLCBTX0NPVU5UKTtcclxuICAgICAgICBjaGVjayQxLm9wdGlvbmFsKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgIGVudi5hc3NlcnQoc2NvcGUsIENPVU5UICsgJz49MCcsICdtaXNzaW5nIHZlcnRleCBjb3VudCcpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBDT1VOVFxyXG4gICAgfVxyXG5cclxuICAgIHZhciBFTEVNRU5UUyA9IGVtaXRFbGVtZW50cygpO1xyXG4gICAgZnVuY3Rpb24gZW1pdFZhbHVlIChuYW1lKSB7XHJcbiAgICAgIHZhciBkZWZuID0gZHJhd09wdGlvbnNbbmFtZV07XHJcbiAgICAgIGlmIChkZWZuKSB7XHJcbiAgICAgICAgaWYgKChkZWZuLmNvbnRleHREZXAgJiYgYXJncy5jb250ZXh0RHluYW1pYykgfHwgZGVmbi5wcm9wRGVwKSB7XHJcbiAgICAgICAgICByZXR1cm4gZGVmbi5hcHBlbmQoZW52LCBpbm5lcilcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgcmV0dXJuIGRlZm4uYXBwZW5kKGVudiwgb3V0ZXIpXHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHJldHVybiBvdXRlci5kZWYoRFJBV19TVEFURSwgJy4nLCBuYW1lKVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIFBSSU1JVElWRSA9IGVtaXRWYWx1ZShTX1BSSU1JVElWRSk7XHJcbiAgICB2YXIgT0ZGU0VUID0gZW1pdFZhbHVlKFNfT0ZGU0VUKTtcclxuXHJcbiAgICB2YXIgQ09VTlQgPSBlbWl0Q291bnQoKTtcclxuICAgIGlmICh0eXBlb2YgQ09VTlQgPT09ICdudW1iZXInKSB7XHJcbiAgICAgIGlmIChDT1VOVCA9PT0gMCkge1xyXG4gICAgICAgIHJldHVyblxyXG4gICAgICB9XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBpbm5lcignaWYoJywgQ09VTlQsICcpeycpO1xyXG4gICAgICBpbm5lci5leGl0KCd9Jyk7XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIElOU1RBTkNFUywgRVhUX0lOU1RBTkNJTkc7XHJcbiAgICBpZiAoZXh0SW5zdGFuY2luZykge1xyXG4gICAgICBJTlNUQU5DRVMgPSBlbWl0VmFsdWUoU19JTlNUQU5DRVMpO1xyXG4gICAgICBFWFRfSU5TVEFOQ0lORyA9IGVudi5pbnN0YW5jaW5nO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBFTEVNRU5UX1RZUEUgPSBFTEVNRU5UUyArICcudHlwZSc7XHJcblxyXG4gICAgdmFyIGVsZW1lbnRzU3RhdGljID0gZHJhd09wdGlvbnMuZWxlbWVudHMgJiYgaXNTdGF0aWMoZHJhd09wdGlvbnMuZWxlbWVudHMpO1xyXG5cclxuICAgIGZ1bmN0aW9uIGVtaXRJbnN0YW5jaW5nICgpIHtcclxuICAgICAgZnVuY3Rpb24gZHJhd0VsZW1lbnRzICgpIHtcclxuICAgICAgICBpbm5lcihFWFRfSU5TVEFOQ0lORywgJy5kcmF3RWxlbWVudHNJbnN0YW5jZWRBTkdMRSgnLCBbXHJcbiAgICAgICAgICBQUklNSVRJVkUsXHJcbiAgICAgICAgICBDT1VOVCxcclxuICAgICAgICAgIEVMRU1FTlRfVFlQRSxcclxuICAgICAgICAgIE9GRlNFVCArICc8PCgoJyArIEVMRU1FTlRfVFlQRSArICctJyArIEdMX1VOU0lHTkVEX0JZVEUkOCArICcpPj4xKScsXHJcbiAgICAgICAgICBJTlNUQU5DRVNcclxuICAgICAgICBdLCAnKTsnKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgZnVuY3Rpb24gZHJhd0FycmF5cyAoKSB7XHJcbiAgICAgICAgaW5uZXIoRVhUX0lOU1RBTkNJTkcsICcuZHJhd0FycmF5c0luc3RhbmNlZEFOR0xFKCcsXHJcbiAgICAgICAgICBbUFJJTUlUSVZFLCBPRkZTRVQsIENPVU5ULCBJTlNUQU5DRVNdLCAnKTsnKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKEVMRU1FTlRTKSB7XHJcbiAgICAgICAgaWYgKCFlbGVtZW50c1N0YXRpYykge1xyXG4gICAgICAgICAgaW5uZXIoJ2lmKCcsIEVMRU1FTlRTLCAnKXsnKTtcclxuICAgICAgICAgIGRyYXdFbGVtZW50cygpO1xyXG4gICAgICAgICAgaW5uZXIoJ31lbHNleycpO1xyXG4gICAgICAgICAgZHJhd0FycmF5cygpO1xyXG4gICAgICAgICAgaW5uZXIoJ30nKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgZHJhd0VsZW1lbnRzKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGRyYXdBcnJheXMoKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGVtaXRSZWd1bGFyICgpIHtcclxuICAgICAgZnVuY3Rpb24gZHJhd0VsZW1lbnRzICgpIHtcclxuICAgICAgICBpbm5lcihHTCArICcuZHJhd0VsZW1lbnRzKCcgKyBbXHJcbiAgICAgICAgICBQUklNSVRJVkUsXHJcbiAgICAgICAgICBDT1VOVCxcclxuICAgICAgICAgIEVMRU1FTlRfVFlQRSxcclxuICAgICAgICAgIE9GRlNFVCArICc8PCgoJyArIEVMRU1FTlRfVFlQRSArICctJyArIEdMX1VOU0lHTkVEX0JZVEUkOCArICcpPj4xKSdcclxuICAgICAgICBdICsgJyk7Jyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGZ1bmN0aW9uIGRyYXdBcnJheXMgKCkge1xyXG4gICAgICAgIGlubmVyKEdMICsgJy5kcmF3QXJyYXlzKCcgKyBbUFJJTUlUSVZFLCBPRkZTRVQsIENPVU5UXSArICcpOycpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAoRUxFTUVOVFMpIHtcclxuICAgICAgICBpZiAoIWVsZW1lbnRzU3RhdGljKSB7XHJcbiAgICAgICAgICBpbm5lcignaWYoJywgRUxFTUVOVFMsICcpeycpO1xyXG4gICAgICAgICAgZHJhd0VsZW1lbnRzKCk7XHJcbiAgICAgICAgICBpbm5lcignfWVsc2V7Jyk7XHJcbiAgICAgICAgICBkcmF3QXJyYXlzKCk7XHJcbiAgICAgICAgICBpbm5lcignfScpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBkcmF3RWxlbWVudHMoKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgZHJhd0FycmF5cygpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGV4dEluc3RhbmNpbmcgJiYgKHR5cGVvZiBJTlNUQU5DRVMgIT09ICdudW1iZXInIHx8IElOU1RBTkNFUyA+PSAwKSkge1xyXG4gICAgICBpZiAodHlwZW9mIElOU1RBTkNFUyA9PT0gJ3N0cmluZycpIHtcclxuICAgICAgICBpbm5lcignaWYoJywgSU5TVEFOQ0VTLCAnPjApeycpO1xyXG4gICAgICAgIGVtaXRJbnN0YW5jaW5nKCk7XHJcbiAgICAgICAgaW5uZXIoJ31lbHNlIGlmKCcsIElOU1RBTkNFUywgJzwwKXsnKTtcclxuICAgICAgICBlbWl0UmVndWxhcigpO1xyXG4gICAgICAgIGlubmVyKCd9Jyk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgZW1pdEluc3RhbmNpbmcoKTtcclxuICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgZW1pdFJlZ3VsYXIoKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGNyZWF0ZUJvZHkgKGVtaXRCb2R5LCBwYXJlbnRFbnYsIGFyZ3MsIHByb2dyYW0sIGNvdW50KSB7XHJcbiAgICB2YXIgZW52ID0gY3JlYXRlUkVHTEVudmlyb25tZW50KCk7XHJcbiAgICB2YXIgc2NvcGUgPSBlbnYucHJvYygnYm9keScsIGNvdW50KTtcclxuICAgIGNoZWNrJDEub3B0aW9uYWwoZnVuY3Rpb24gKCkge1xyXG4gICAgICBlbnYuY29tbWFuZFN0ciA9IHBhcmVudEVudi5jb21tYW5kU3RyO1xyXG4gICAgICBlbnYuY29tbWFuZCA9IGVudi5saW5rKHBhcmVudEVudi5jb21tYW5kU3RyKTtcclxuICAgIH0pO1xyXG4gICAgaWYgKGV4dEluc3RhbmNpbmcpIHtcclxuICAgICAgZW52Lmluc3RhbmNpbmcgPSBzY29wZS5kZWYoXHJcbiAgICAgICAgZW52LnNoYXJlZC5leHRlbnNpb25zLCAnLmFuZ2xlX2luc3RhbmNlZF9hcnJheXMnKTtcclxuICAgIH1cclxuICAgIGVtaXRCb2R5KGVudiwgc2NvcGUsIGFyZ3MsIHByb2dyYW0pO1xyXG4gICAgcmV0dXJuIGVudi5jb21waWxlKCkuYm9keVxyXG4gIH1cclxuXHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgLy8gRFJBVyBQUk9DXHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgZnVuY3Rpb24gZW1pdERyYXdCb2R5IChlbnYsIGRyYXcsIGFyZ3MsIHByb2dyYW0pIHtcclxuICAgIGluamVjdEV4dGVuc2lvbnMoZW52LCBkcmF3KTtcclxuICAgIGVtaXRBdHRyaWJ1dGVzKGVudiwgZHJhdywgYXJncywgcHJvZ3JhbS5hdHRyaWJ1dGVzLCBmdW5jdGlvbiAoKSB7XHJcbiAgICAgIHJldHVybiB0cnVlXHJcbiAgICB9KTtcclxuICAgIGVtaXRVbmlmb3JtcyhlbnYsIGRyYXcsIGFyZ3MsIHByb2dyYW0udW5pZm9ybXMsIGZ1bmN0aW9uICgpIHtcclxuICAgICAgcmV0dXJuIHRydWVcclxuICAgIH0pO1xyXG4gICAgZW1pdERyYXcoZW52LCBkcmF3LCBkcmF3LCBhcmdzKTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGVtaXREcmF3UHJvYyAoZW52LCBhcmdzKSB7XHJcbiAgICB2YXIgZHJhdyA9IGVudi5wcm9jKCdkcmF3JywgMSk7XHJcblxyXG4gICAgaW5qZWN0RXh0ZW5zaW9ucyhlbnYsIGRyYXcpO1xyXG5cclxuICAgIGVtaXRDb250ZXh0KGVudiwgZHJhdywgYXJncy5jb250ZXh0KTtcclxuICAgIGVtaXRQb2xsRnJhbWVidWZmZXIoZW52LCBkcmF3LCBhcmdzLmZyYW1lYnVmZmVyKTtcclxuXHJcbiAgICBlbWl0UG9sbFN0YXRlKGVudiwgZHJhdywgYXJncyk7XHJcbiAgICBlbWl0U2V0T3B0aW9ucyhlbnYsIGRyYXcsIGFyZ3Muc3RhdGUpO1xyXG5cclxuICAgIGVtaXRQcm9maWxlKGVudiwgZHJhdywgYXJncywgZmFsc2UsIHRydWUpO1xyXG5cclxuICAgIHZhciBwcm9ncmFtID0gYXJncy5zaGFkZXIucHJvZ1Zhci5hcHBlbmQoZW52LCBkcmF3KTtcclxuICAgIGRyYXcoZW52LnNoYXJlZC5nbCwgJy51c2VQcm9ncmFtKCcsIHByb2dyYW0sICcucHJvZ3JhbSk7Jyk7XHJcblxyXG4gICAgaWYgKGFyZ3Muc2hhZGVyLnByb2dyYW0pIHtcclxuICAgICAgZW1pdERyYXdCb2R5KGVudiwgZHJhdywgYXJncywgYXJncy5zaGFkZXIucHJvZ3JhbSk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB2YXIgZHJhd0NhY2hlID0gZW52Lmdsb2JhbC5kZWYoJ3t9Jyk7XHJcbiAgICAgIHZhciBQUk9HX0lEID0gZHJhdy5kZWYocHJvZ3JhbSwgJy5pZCcpO1xyXG4gICAgICB2YXIgQ0FDSEVEX1BST0MgPSBkcmF3LmRlZihkcmF3Q2FjaGUsICdbJywgUFJPR19JRCwgJ10nKTtcclxuICAgICAgZHJhdyhcclxuICAgICAgICBlbnYuY29uZChDQUNIRURfUFJPQylcclxuICAgICAgICAgIC50aGVuKENBQ0hFRF9QUk9DLCAnLmNhbGwodGhpcyxhMCk7JylcclxuICAgICAgICAgIC5lbHNlKFxyXG4gICAgICAgICAgICBDQUNIRURfUFJPQywgJz0nLCBkcmF3Q2FjaGUsICdbJywgUFJPR19JRCwgJ109JyxcclxuICAgICAgICAgICAgZW52LmxpbmsoZnVuY3Rpb24gKHByb2dyYW0pIHtcclxuICAgICAgICAgICAgICByZXR1cm4gY3JlYXRlQm9keShlbWl0RHJhd0JvZHksIGVudiwgYXJncywgcHJvZ3JhbSwgMSlcclxuICAgICAgICAgICAgfSksICcoJywgcHJvZ3JhbSwgJyk7JyxcclxuICAgICAgICAgICAgQ0FDSEVEX1BST0MsICcuY2FsbCh0aGlzLGEwKTsnKSk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKE9iamVjdC5rZXlzKGFyZ3Muc3RhdGUpLmxlbmd0aCA+IDApIHtcclxuICAgICAgZHJhdyhlbnYuc2hhcmVkLmN1cnJlbnQsICcuZGlydHk9dHJ1ZTsnKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gIC8vIEJBVENIIFBST0NcclxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuXHJcbiAgZnVuY3Rpb24gZW1pdEJhdGNoRHluYW1pY1NoYWRlckJvZHkgKGVudiwgc2NvcGUsIGFyZ3MsIHByb2dyYW0pIHtcclxuICAgIGVudi5iYXRjaElkID0gJ2ExJztcclxuXHJcbiAgICBpbmplY3RFeHRlbnNpb25zKGVudiwgc2NvcGUpO1xyXG5cclxuICAgIGZ1bmN0aW9uIGFsbCAoKSB7XHJcbiAgICAgIHJldHVybiB0cnVlXHJcbiAgICB9XHJcblxyXG4gICAgZW1pdEF0dHJpYnV0ZXMoZW52LCBzY29wZSwgYXJncywgcHJvZ3JhbS5hdHRyaWJ1dGVzLCBhbGwpO1xyXG4gICAgZW1pdFVuaWZvcm1zKGVudiwgc2NvcGUsIGFyZ3MsIHByb2dyYW0udW5pZm9ybXMsIGFsbCk7XHJcbiAgICBlbWl0RHJhdyhlbnYsIHNjb3BlLCBzY29wZSwgYXJncyk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBlbWl0QmF0Y2hCb2R5IChlbnYsIHNjb3BlLCBhcmdzLCBwcm9ncmFtKSB7XHJcbiAgICBpbmplY3RFeHRlbnNpb25zKGVudiwgc2NvcGUpO1xyXG5cclxuICAgIHZhciBjb250ZXh0RHluYW1pYyA9IGFyZ3MuY29udGV4dERlcDtcclxuXHJcbiAgICB2YXIgQkFUQ0hfSUQgPSBzY29wZS5kZWYoKTtcclxuICAgIHZhciBQUk9QX0xJU1QgPSAnYTAnO1xyXG4gICAgdmFyIE5VTV9QUk9QUyA9ICdhMSc7XHJcbiAgICB2YXIgUFJPUFMgPSBzY29wZS5kZWYoKTtcclxuICAgIGVudi5zaGFyZWQucHJvcHMgPSBQUk9QUztcclxuICAgIGVudi5iYXRjaElkID0gQkFUQ0hfSUQ7XHJcblxyXG4gICAgdmFyIG91dGVyID0gZW52LnNjb3BlKCk7XHJcbiAgICB2YXIgaW5uZXIgPSBlbnYuc2NvcGUoKTtcclxuXHJcbiAgICBzY29wZShcclxuICAgICAgb3V0ZXIuZW50cnksXHJcbiAgICAgICdmb3IoJywgQkFUQ0hfSUQsICc9MDsnLCBCQVRDSF9JRCwgJzwnLCBOVU1fUFJPUFMsICc7KysnLCBCQVRDSF9JRCwgJyl7JyxcclxuICAgICAgUFJPUFMsICc9JywgUFJPUF9MSVNULCAnWycsIEJBVENIX0lELCAnXTsnLFxyXG4gICAgICBpbm5lcixcclxuICAgICAgJ30nLFxyXG4gICAgICBvdXRlci5leGl0KTtcclxuXHJcbiAgICBmdW5jdGlvbiBpc0lubmVyRGVmbiAoZGVmbikge1xyXG4gICAgICByZXR1cm4gKChkZWZuLmNvbnRleHREZXAgJiYgY29udGV4dER5bmFtaWMpIHx8IGRlZm4ucHJvcERlcClcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBpc091dGVyRGVmbiAoZGVmbikge1xyXG4gICAgICByZXR1cm4gIWlzSW5uZXJEZWZuKGRlZm4pXHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGFyZ3MubmVlZHNDb250ZXh0KSB7XHJcbiAgICAgIGVtaXRDb250ZXh0KGVudiwgaW5uZXIsIGFyZ3MuY29udGV4dCk7XHJcbiAgICB9XHJcbiAgICBpZiAoYXJncy5uZWVkc0ZyYW1lYnVmZmVyKSB7XHJcbiAgICAgIGVtaXRQb2xsRnJhbWVidWZmZXIoZW52LCBpbm5lciwgYXJncy5mcmFtZWJ1ZmZlcik7XHJcbiAgICB9XHJcbiAgICBlbWl0U2V0T3B0aW9ucyhlbnYsIGlubmVyLCBhcmdzLnN0YXRlLCBpc0lubmVyRGVmbik7XHJcblxyXG4gICAgaWYgKGFyZ3MucHJvZmlsZSAmJiBpc0lubmVyRGVmbihhcmdzLnByb2ZpbGUpKSB7XHJcbiAgICAgIGVtaXRQcm9maWxlKGVudiwgaW5uZXIsIGFyZ3MsIGZhbHNlLCB0cnVlKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIXByb2dyYW0pIHtcclxuICAgICAgdmFyIHByb2dDYWNoZSA9IGVudi5nbG9iYWwuZGVmKCd7fScpO1xyXG4gICAgICB2YXIgUFJPR1JBTSA9IGFyZ3Muc2hhZGVyLnByb2dWYXIuYXBwZW5kKGVudiwgaW5uZXIpO1xyXG4gICAgICB2YXIgUFJPR19JRCA9IGlubmVyLmRlZihQUk9HUkFNLCAnLmlkJyk7XHJcbiAgICAgIHZhciBDQUNIRURfUFJPQyA9IGlubmVyLmRlZihwcm9nQ2FjaGUsICdbJywgUFJPR19JRCwgJ10nKTtcclxuICAgICAgaW5uZXIoXHJcbiAgICAgICAgZW52LnNoYXJlZC5nbCwgJy51c2VQcm9ncmFtKCcsIFBST0dSQU0sICcucHJvZ3JhbSk7JyxcclxuICAgICAgICAnaWYoIScsIENBQ0hFRF9QUk9DLCAnKXsnLFxyXG4gICAgICAgIENBQ0hFRF9QUk9DLCAnPScsIHByb2dDYWNoZSwgJ1snLCBQUk9HX0lELCAnXT0nLFxyXG4gICAgICAgIGVudi5saW5rKGZ1bmN0aW9uIChwcm9ncmFtKSB7XHJcbiAgICAgICAgICByZXR1cm4gY3JlYXRlQm9keShcclxuICAgICAgICAgICAgZW1pdEJhdGNoRHluYW1pY1NoYWRlckJvZHksIGVudiwgYXJncywgcHJvZ3JhbSwgMilcclxuICAgICAgICB9KSwgJygnLCBQUk9HUkFNLCAnKTt9JyxcclxuICAgICAgICBDQUNIRURfUFJPQywgJy5jYWxsKHRoaXMsYTBbJywgQkFUQ0hfSUQsICddLCcsIEJBVENIX0lELCAnKTsnKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGVtaXRBdHRyaWJ1dGVzKGVudiwgb3V0ZXIsIGFyZ3MsIHByb2dyYW0uYXR0cmlidXRlcywgaXNPdXRlckRlZm4pO1xyXG4gICAgICBlbWl0QXR0cmlidXRlcyhlbnYsIGlubmVyLCBhcmdzLCBwcm9ncmFtLmF0dHJpYnV0ZXMsIGlzSW5uZXJEZWZuKTtcclxuICAgICAgZW1pdFVuaWZvcm1zKGVudiwgb3V0ZXIsIGFyZ3MsIHByb2dyYW0udW5pZm9ybXMsIGlzT3V0ZXJEZWZuKTtcclxuICAgICAgZW1pdFVuaWZvcm1zKGVudiwgaW5uZXIsIGFyZ3MsIHByb2dyYW0udW5pZm9ybXMsIGlzSW5uZXJEZWZuKTtcclxuICAgICAgZW1pdERyYXcoZW52LCBvdXRlciwgaW5uZXIsIGFyZ3MpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZW1pdEJhdGNoUHJvYyAoZW52LCBhcmdzKSB7XHJcbiAgICB2YXIgYmF0Y2ggPSBlbnYucHJvYygnYmF0Y2gnLCAyKTtcclxuICAgIGVudi5iYXRjaElkID0gJzAnO1xyXG5cclxuICAgIGluamVjdEV4dGVuc2lvbnMoZW52LCBiYXRjaCk7XHJcblxyXG4gICAgLy8gQ2hlY2sgaWYgYW55IGNvbnRleHQgdmFyaWFibGVzIGRlcGVuZCBvbiBwcm9wc1xyXG4gICAgdmFyIGNvbnRleHREeW5hbWljID0gZmFsc2U7XHJcbiAgICB2YXIgbmVlZHNDb250ZXh0ID0gdHJ1ZTtcclxuICAgIE9iamVjdC5rZXlzKGFyZ3MuY29udGV4dCkuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xyXG4gICAgICBjb250ZXh0RHluYW1pYyA9IGNvbnRleHREeW5hbWljIHx8IGFyZ3MuY29udGV4dFtuYW1lXS5wcm9wRGVwO1xyXG4gICAgfSk7XHJcbiAgICBpZiAoIWNvbnRleHREeW5hbWljKSB7XHJcbiAgICAgIGVtaXRDb250ZXh0KGVudiwgYmF0Y2gsIGFyZ3MuY29udGV4dCk7XHJcbiAgICAgIG5lZWRzQ29udGV4dCA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIGZyYW1lYnVmZmVyIHN0YXRlIGFmZmVjdHMgZnJhbWVidWZmZXJXaWR0aC9oZWlnaHQgY29udGV4dCB2YXJzXHJcbiAgICB2YXIgZnJhbWVidWZmZXIgPSBhcmdzLmZyYW1lYnVmZmVyO1xyXG4gICAgdmFyIG5lZWRzRnJhbWVidWZmZXIgPSBmYWxzZTtcclxuICAgIGlmIChmcmFtZWJ1ZmZlcikge1xyXG4gICAgICBpZiAoZnJhbWVidWZmZXIucHJvcERlcCkge1xyXG4gICAgICAgIGNvbnRleHREeW5hbWljID0gbmVlZHNGcmFtZWJ1ZmZlciA9IHRydWU7XHJcbiAgICAgIH0gZWxzZSBpZiAoZnJhbWVidWZmZXIuY29udGV4dERlcCAmJiBjb250ZXh0RHluYW1pYykge1xyXG4gICAgICAgIG5lZWRzRnJhbWVidWZmZXIgPSB0cnVlO1xyXG4gICAgICB9XHJcbiAgICAgIGlmICghbmVlZHNGcmFtZWJ1ZmZlcikge1xyXG4gICAgICAgIGVtaXRQb2xsRnJhbWVidWZmZXIoZW52LCBiYXRjaCwgZnJhbWVidWZmZXIpO1xyXG4gICAgICB9XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBlbWl0UG9sbEZyYW1lYnVmZmVyKGVudiwgYmF0Y2gsIG51bGwpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIHZpZXdwb3J0IGlzIHdlaXJkIGJlY2F1c2UgaXQgY2FuIGFmZmVjdCBjb250ZXh0IHZhcnNcclxuICAgIGlmIChhcmdzLnN0YXRlLnZpZXdwb3J0ICYmIGFyZ3Muc3RhdGUudmlld3BvcnQucHJvcERlcCkge1xyXG4gICAgICBjb250ZXh0RHluYW1pYyA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gaXNJbm5lckRlZm4gKGRlZm4pIHtcclxuICAgICAgcmV0dXJuIChkZWZuLmNvbnRleHREZXAgJiYgY29udGV4dER5bmFtaWMpIHx8IGRlZm4ucHJvcERlcFxyXG4gICAgfVxyXG5cclxuICAgIC8vIHNldCB3ZWJnbCBvcHRpb25zXHJcbiAgICBlbWl0UG9sbFN0YXRlKGVudiwgYmF0Y2gsIGFyZ3MpO1xyXG4gICAgZW1pdFNldE9wdGlvbnMoZW52LCBiYXRjaCwgYXJncy5zdGF0ZSwgZnVuY3Rpb24gKGRlZm4pIHtcclxuICAgICAgcmV0dXJuICFpc0lubmVyRGVmbihkZWZuKVxyXG4gICAgfSk7XHJcblxyXG4gICAgaWYgKCFhcmdzLnByb2ZpbGUgfHwgIWlzSW5uZXJEZWZuKGFyZ3MucHJvZmlsZSkpIHtcclxuICAgICAgZW1pdFByb2ZpbGUoZW52LCBiYXRjaCwgYXJncywgZmFsc2UsICdhMScpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFNhdmUgdGhlc2UgdmFsdWVzIHRvIGFyZ3Mgc28gdGhhdCB0aGUgYmF0Y2ggYm9keSByb3V0aW5lIGNhbiB1c2UgdGhlbVxyXG4gICAgYXJncy5jb250ZXh0RGVwID0gY29udGV4dER5bmFtaWM7XHJcbiAgICBhcmdzLm5lZWRzQ29udGV4dCA9IG5lZWRzQ29udGV4dDtcclxuICAgIGFyZ3MubmVlZHNGcmFtZWJ1ZmZlciA9IG5lZWRzRnJhbWVidWZmZXI7XHJcblxyXG4gICAgLy8gZGV0ZXJtaW5lIGlmIHNoYWRlciBpcyBkeW5hbWljXHJcbiAgICB2YXIgcHJvZ0RlZm4gPSBhcmdzLnNoYWRlci5wcm9nVmFyO1xyXG4gICAgaWYgKChwcm9nRGVmbi5jb250ZXh0RGVwICYmIGNvbnRleHREeW5hbWljKSB8fCBwcm9nRGVmbi5wcm9wRGVwKSB7XHJcbiAgICAgIGVtaXRCYXRjaEJvZHkoXHJcbiAgICAgICAgZW52LFxyXG4gICAgICAgIGJhdGNoLFxyXG4gICAgICAgIGFyZ3MsXHJcbiAgICAgICAgbnVsbCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB2YXIgUFJPR1JBTSA9IHByb2dEZWZuLmFwcGVuZChlbnYsIGJhdGNoKTtcclxuICAgICAgYmF0Y2goZW52LnNoYXJlZC5nbCwgJy51c2VQcm9ncmFtKCcsIFBST0dSQU0sICcucHJvZ3JhbSk7Jyk7XHJcbiAgICAgIGlmIChhcmdzLnNoYWRlci5wcm9ncmFtKSB7XHJcbiAgICAgICAgZW1pdEJhdGNoQm9keShcclxuICAgICAgICAgIGVudixcclxuICAgICAgICAgIGJhdGNoLFxyXG4gICAgICAgICAgYXJncyxcclxuICAgICAgICAgIGFyZ3Muc2hhZGVyLnByb2dyYW0pO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHZhciBiYXRjaENhY2hlID0gZW52Lmdsb2JhbC5kZWYoJ3t9Jyk7XHJcbiAgICAgICAgdmFyIFBST0dfSUQgPSBiYXRjaC5kZWYoUFJPR1JBTSwgJy5pZCcpO1xyXG4gICAgICAgIHZhciBDQUNIRURfUFJPQyA9IGJhdGNoLmRlZihiYXRjaENhY2hlLCAnWycsIFBST0dfSUQsICddJyk7XHJcbiAgICAgICAgYmF0Y2goXHJcbiAgICAgICAgICBlbnYuY29uZChDQUNIRURfUFJPQylcclxuICAgICAgICAgICAgLnRoZW4oQ0FDSEVEX1BST0MsICcuY2FsbCh0aGlzLGEwLGExKTsnKVxyXG4gICAgICAgICAgICAuZWxzZShcclxuICAgICAgICAgICAgICBDQUNIRURfUFJPQywgJz0nLCBiYXRjaENhY2hlLCAnWycsIFBST0dfSUQsICddPScsXHJcbiAgICAgICAgICAgICAgZW52LmxpbmsoZnVuY3Rpb24gKHByb2dyYW0pIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBjcmVhdGVCb2R5KGVtaXRCYXRjaEJvZHksIGVudiwgYXJncywgcHJvZ3JhbSwgMilcclxuICAgICAgICAgICAgICB9KSwgJygnLCBQUk9HUkFNLCAnKTsnLFxyXG4gICAgICAgICAgICAgIENBQ0hFRF9QUk9DLCAnLmNhbGwodGhpcyxhMCxhMSk7JykpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKE9iamVjdC5rZXlzKGFyZ3Muc3RhdGUpLmxlbmd0aCA+IDApIHtcclxuICAgICAgYmF0Y2goZW52LnNoYXJlZC5jdXJyZW50LCAnLmRpcnR5PXRydWU7Jyk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAvLyBTQ09QRSBDT01NQU5EXHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgZnVuY3Rpb24gZW1pdFNjb3BlUHJvYyAoZW52LCBhcmdzKSB7XHJcbiAgICB2YXIgc2NvcGUgPSBlbnYucHJvYygnc2NvcGUnLCAzKTtcclxuICAgIGVudi5iYXRjaElkID0gJ2EyJztcclxuXHJcbiAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZDtcclxuICAgIHZhciBDVVJSRU5UX1NUQVRFID0gc2hhcmVkLmN1cnJlbnQ7XHJcblxyXG4gICAgZW1pdENvbnRleHQoZW52LCBzY29wZSwgYXJncy5jb250ZXh0KTtcclxuXHJcbiAgICBpZiAoYXJncy5mcmFtZWJ1ZmZlcikge1xyXG4gICAgICBhcmdzLmZyYW1lYnVmZmVyLmFwcGVuZChlbnYsIHNjb3BlKTtcclxuICAgIH1cclxuXHJcbiAgICBzb3J0U3RhdGUoT2JqZWN0LmtleXMoYXJncy5zdGF0ZSkpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcclxuICAgICAgdmFyIGRlZm4gPSBhcmdzLnN0YXRlW25hbWVdO1xyXG4gICAgICB2YXIgdmFsdWUgPSBkZWZuLmFwcGVuZChlbnYsIHNjb3BlKTtcclxuICAgICAgaWYgKGlzQXJyYXlMaWtlKHZhbHVlKSkge1xyXG4gICAgICAgIHZhbHVlLmZvckVhY2goZnVuY3Rpb24gKHYsIGkpIHtcclxuICAgICAgICAgIHNjb3BlLnNldChlbnYubmV4dFtuYW1lXSwgJ1snICsgaSArICddJywgdik7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgc2NvcGUuc2V0KHNoYXJlZC5uZXh0LCAnLicgKyBuYW1lLCB2YWx1ZSk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIGVtaXRQcm9maWxlKGVudiwgc2NvcGUsIGFyZ3MsIHRydWUsIHRydWUpXHJcblxyXG4gICAgO1tTX0VMRU1FTlRTLCBTX09GRlNFVCwgU19DT1VOVCwgU19JTlNUQU5DRVMsIFNfUFJJTUlUSVZFXS5mb3JFYWNoKFxyXG4gICAgICBmdW5jdGlvbiAob3B0KSB7XHJcbiAgICAgICAgdmFyIHZhcmlhYmxlID0gYXJncy5kcmF3W29wdF07XHJcbiAgICAgICAgaWYgKCF2YXJpYWJsZSkge1xyXG4gICAgICAgICAgcmV0dXJuXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHNjb3BlLnNldChzaGFyZWQuZHJhdywgJy4nICsgb3B0LCAnJyArIHZhcmlhYmxlLmFwcGVuZChlbnYsIHNjb3BlKSk7XHJcbiAgICAgIH0pO1xyXG5cclxuICAgIE9iamVjdC5rZXlzKGFyZ3MudW5pZm9ybXMpLmZvckVhY2goZnVuY3Rpb24gKG9wdCkge1xyXG4gICAgICBzY29wZS5zZXQoXHJcbiAgICAgICAgc2hhcmVkLnVuaWZvcm1zLFxyXG4gICAgICAgICdbJyArIHN0cmluZ1N0b3JlLmlkKG9wdCkgKyAnXScsXHJcbiAgICAgICAgYXJncy51bmlmb3Jtc1tvcHRdLmFwcGVuZChlbnYsIHNjb3BlKSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBPYmplY3Qua2V5cyhhcmdzLmF0dHJpYnV0ZXMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcclxuICAgICAgdmFyIHJlY29yZCA9IGFyZ3MuYXR0cmlidXRlc1tuYW1lXS5hcHBlbmQoZW52LCBzY29wZSk7XHJcbiAgICAgIHZhciBzY29wZUF0dHJpYiA9IGVudi5zY29wZUF0dHJpYihuYW1lKTtcclxuICAgICAgT2JqZWN0LmtleXMobmV3IEF0dHJpYnV0ZVJlY29yZCgpKS5mb3JFYWNoKGZ1bmN0aW9uIChwcm9wKSB7XHJcbiAgICAgICAgc2NvcGUuc2V0KHNjb3BlQXR0cmliLCAnLicgKyBwcm9wLCByZWNvcmRbcHJvcF0pO1xyXG4gICAgICB9KTtcclxuICAgIH0pO1xyXG5cclxuICAgIGZ1bmN0aW9uIHNhdmVTaGFkZXIgKG5hbWUpIHtcclxuICAgICAgdmFyIHNoYWRlciA9IGFyZ3Muc2hhZGVyW25hbWVdO1xyXG4gICAgICBpZiAoc2hhZGVyKSB7XHJcbiAgICAgICAgc2NvcGUuc2V0KHNoYXJlZC5zaGFkZXIsICcuJyArIG5hbWUsIHNoYWRlci5hcHBlbmQoZW52LCBzY29wZSkpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBzYXZlU2hhZGVyKFNfVkVSVCk7XHJcbiAgICBzYXZlU2hhZGVyKFNfRlJBRyk7XHJcblxyXG4gICAgaWYgKE9iamVjdC5rZXlzKGFyZ3Muc3RhdGUpLmxlbmd0aCA+IDApIHtcclxuICAgICAgc2NvcGUoQ1VSUkVOVF9TVEFURSwgJy5kaXJ0eT10cnVlOycpO1xyXG4gICAgICBzY29wZS5leGl0KENVUlJFTlRfU1RBVEUsICcuZGlydHk9dHJ1ZTsnKTtcclxuICAgIH1cclxuXHJcbiAgICBzY29wZSgnYTEoJywgZW52LnNoYXJlZC5jb250ZXh0LCAnLGEwLCcsIGVudi5iYXRjaElkLCAnKTsnKTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGlzRHluYW1pY09iamVjdCAob2JqZWN0KSB7XHJcbiAgICBpZiAodHlwZW9mIG9iamVjdCAhPT0gJ29iamVjdCcgfHwgaXNBcnJheUxpa2Uob2JqZWN0KSkge1xyXG4gICAgICByZXR1cm5cclxuICAgIH1cclxuICAgIHZhciBwcm9wcyA9IE9iamVjdC5rZXlzKG9iamVjdCk7XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHByb3BzLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgIGlmIChkeW5hbWljLmlzRHluYW1pYyhvYmplY3RbcHJvcHNbaV1dKSkge1xyXG4gICAgICAgIHJldHVybiB0cnVlXHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiBmYWxzZVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gc3BsYXRPYmplY3QgKGVudiwgb3B0aW9ucywgbmFtZSkge1xyXG4gICAgdmFyIG9iamVjdCA9IG9wdGlvbnMuc3RhdGljW25hbWVdO1xyXG4gICAgaWYgKCFvYmplY3QgfHwgIWlzRHluYW1pY09iamVjdChvYmplY3QpKSB7XHJcbiAgICAgIHJldHVyblxyXG4gICAgfVxyXG5cclxuICAgIHZhciBnbG9iYWxzID0gZW52Lmdsb2JhbDtcclxuICAgIHZhciBrZXlzID0gT2JqZWN0LmtleXMob2JqZWN0KTtcclxuICAgIHZhciB0aGlzRGVwID0gZmFsc2U7XHJcbiAgICB2YXIgY29udGV4dERlcCA9IGZhbHNlO1xyXG4gICAgdmFyIHByb3BEZXAgPSBmYWxzZTtcclxuICAgIHZhciBvYmplY3RSZWYgPSBlbnYuZ2xvYmFsLmRlZigne30nKTtcclxuICAgIGtleXMuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XHJcbiAgICAgIHZhciB2YWx1ZSA9IG9iamVjdFtrZXldO1xyXG4gICAgICBpZiAoZHluYW1pYy5pc0R5bmFtaWModmFsdWUpKSB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgdmFsdWUgPSBvYmplY3Rba2V5XSA9IGR5bmFtaWMudW5ib3godmFsdWUpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB2YXIgZGVwcyA9IGNyZWF0ZUR5bmFtaWNEZWNsKHZhbHVlLCBudWxsKTtcclxuICAgICAgICB0aGlzRGVwID0gdGhpc0RlcCB8fCBkZXBzLnRoaXNEZXA7XHJcbiAgICAgICAgcHJvcERlcCA9IHByb3BEZXAgfHwgZGVwcy5wcm9wRGVwO1xyXG4gICAgICAgIGNvbnRleHREZXAgPSBjb250ZXh0RGVwIHx8IGRlcHMuY29udGV4dERlcDtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBnbG9iYWxzKG9iamVjdFJlZiwgJy4nLCBrZXksICc9Jyk7XHJcbiAgICAgICAgc3dpdGNoICh0eXBlb2YgdmFsdWUpIHtcclxuICAgICAgICAgIGNhc2UgJ251bWJlcic6XHJcbiAgICAgICAgICAgIGdsb2JhbHModmFsdWUpO1xyXG4gICAgICAgICAgICBicmVha1xyXG4gICAgICAgICAgY2FzZSAnc3RyaW5nJzpcclxuICAgICAgICAgICAgZ2xvYmFscygnXCInLCB2YWx1ZSwgJ1wiJyk7XHJcbiAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgICBjYXNlICdvYmplY3QnOlxyXG4gICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcclxuICAgICAgICAgICAgICBnbG9iYWxzKCdbJywgdmFsdWUuam9pbigpLCAnXScpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICBnbG9iYWxzKGVudi5saW5rKHZhbHVlKSk7XHJcbiAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGdsb2JhbHMoJzsnKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgZnVuY3Rpb24gYXBwZW5kQmxvY2sgKGVudiwgYmxvY2spIHtcclxuICAgICAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcclxuICAgICAgICB2YXIgdmFsdWUgPSBvYmplY3Rba2V5XTtcclxuICAgICAgICBpZiAoIWR5bmFtaWMuaXNEeW5hbWljKHZhbHVlKSkge1xyXG4gICAgICAgICAgcmV0dXJuXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHZhciByZWYgPSBlbnYuaW52b2tlKGJsb2NrLCB2YWx1ZSk7XHJcbiAgICAgICAgYmxvY2sob2JqZWN0UmVmLCAnLicsIGtleSwgJz0nLCByZWYsICc7Jyk7XHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIG9wdGlvbnMuZHluYW1pY1tuYW1lXSA9IG5ldyBkeW5hbWljLkR5bmFtaWNWYXJpYWJsZShEWU5fVEhVTkssIHtcclxuICAgICAgdGhpc0RlcDogdGhpc0RlcCxcclxuICAgICAgY29udGV4dERlcDogY29udGV4dERlcCxcclxuICAgICAgcHJvcERlcDogcHJvcERlcCxcclxuICAgICAgcmVmOiBvYmplY3RSZWYsXHJcbiAgICAgIGFwcGVuZDogYXBwZW5kQmxvY2tcclxuICAgIH0pO1xyXG4gICAgZGVsZXRlIG9wdGlvbnMuc3RhdGljW25hbWVdO1xyXG4gIH1cclxuXHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgLy8gTUFJTiBEUkFXIENPTU1BTkRcclxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICBmdW5jdGlvbiBjb21waWxlQ29tbWFuZCAob3B0aW9ucywgYXR0cmlidXRlcywgdW5pZm9ybXMsIGNvbnRleHQsIHN0YXRzKSB7XHJcbiAgICB2YXIgZW52ID0gY3JlYXRlUkVHTEVudmlyb25tZW50KCk7XHJcblxyXG4gICAgLy8gbGluayBzdGF0cywgc28gdGhhdCB3ZSBjYW4gZWFzaWx5IGFjY2VzcyBpdCBpbiB0aGUgcHJvZ3JhbS5cclxuICAgIGVudi5zdGF0cyA9IGVudi5saW5rKHN0YXRzKTtcclxuXHJcbiAgICAvLyBzcGxhdCBvcHRpb25zIGFuZCBhdHRyaWJ1dGVzIHRvIGFsbG93IGZvciBkeW5hbWljIG5lc3RlZCBwcm9wZXJ0aWVzXHJcbiAgICBPYmplY3Qua2V5cyhhdHRyaWJ1dGVzLnN0YXRpYykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XHJcbiAgICAgIHNwbGF0T2JqZWN0KGVudiwgYXR0cmlidXRlcywga2V5KTtcclxuICAgIH0pO1xyXG4gICAgTkVTVEVEX09QVElPTlMuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xyXG4gICAgICBzcGxhdE9iamVjdChlbnYsIG9wdGlvbnMsIG5hbWUpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgdmFyIGFyZ3MgPSBwYXJzZUFyZ3VtZW50cyhvcHRpb25zLCBhdHRyaWJ1dGVzLCB1bmlmb3JtcywgY29udGV4dCwgZW52KTtcclxuXHJcbiAgICBlbWl0RHJhd1Byb2MoZW52LCBhcmdzKTtcclxuICAgIGVtaXRTY29wZVByb2MoZW52LCBhcmdzKTtcclxuICAgIGVtaXRCYXRjaFByb2MoZW52LCBhcmdzKTtcclxuXHJcbiAgICByZXR1cm4gZW52LmNvbXBpbGUoKVxyXG4gIH1cclxuXHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgLy8gUE9MTCAvIFJFRlJFU0hcclxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICByZXR1cm4ge1xyXG4gICAgbmV4dDogbmV4dFN0YXRlLFxyXG4gICAgY3VycmVudDogY3VycmVudFN0YXRlLFxyXG4gICAgcHJvY3M6IChmdW5jdGlvbiAoKSB7XHJcbiAgICAgIHZhciBlbnYgPSBjcmVhdGVSRUdMRW52aXJvbm1lbnQoKTtcclxuICAgICAgdmFyIHBvbGwgPSBlbnYucHJvYygncG9sbCcpO1xyXG4gICAgICB2YXIgcmVmcmVzaCA9IGVudi5wcm9jKCdyZWZyZXNoJyk7XHJcbiAgICAgIHZhciBjb21tb24gPSBlbnYuYmxvY2soKTtcclxuICAgICAgcG9sbChjb21tb24pO1xyXG4gICAgICByZWZyZXNoKGNvbW1vbik7XHJcblxyXG4gICAgICB2YXIgc2hhcmVkID0gZW52LnNoYXJlZDtcclxuICAgICAgdmFyIEdMID0gc2hhcmVkLmdsO1xyXG4gICAgICB2YXIgTkVYVF9TVEFURSA9IHNoYXJlZC5uZXh0O1xyXG4gICAgICB2YXIgQ1VSUkVOVF9TVEFURSA9IHNoYXJlZC5jdXJyZW50O1xyXG5cclxuICAgICAgY29tbW9uKENVUlJFTlRfU1RBVEUsICcuZGlydHk9ZmFsc2U7Jyk7XHJcblxyXG4gICAgICBlbWl0UG9sbEZyYW1lYnVmZmVyKGVudiwgcG9sbCk7XHJcbiAgICAgIGVtaXRQb2xsRnJhbWVidWZmZXIoZW52LCByZWZyZXNoLCBudWxsLCB0cnVlKTtcclxuXHJcbiAgICAgIC8vIFJlZnJlc2ggdXBkYXRlcyBhbGwgYXR0cmlidXRlIHN0YXRlIGNoYW5nZXNcclxuICAgICAgdmFyIElOU1RBTkNJTkc7XHJcbiAgICAgIGlmIChleHRJbnN0YW5jaW5nKSB7XHJcbiAgICAgICAgSU5TVEFOQ0lORyA9IGVudi5saW5rKGV4dEluc3RhbmNpbmcpO1xyXG4gICAgICB9XHJcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGltaXRzLm1heEF0dHJpYnV0ZXM7ICsraSkge1xyXG4gICAgICAgIHZhciBCSU5ESU5HID0gcmVmcmVzaC5kZWYoc2hhcmVkLmF0dHJpYnV0ZXMsICdbJywgaSwgJ10nKTtcclxuICAgICAgICB2YXIgaWZ0ZSA9IGVudi5jb25kKEJJTkRJTkcsICcuYnVmZmVyJyk7XHJcbiAgICAgICAgaWZ0ZS50aGVuKFxyXG4gICAgICAgICAgR0wsICcuZW5hYmxlVmVydGV4QXR0cmliQXJyYXkoJywgaSwgJyk7JyxcclxuICAgICAgICAgIEdMLCAnLmJpbmRCdWZmZXIoJyxcclxuICAgICAgICAgICAgR0xfQVJSQVlfQlVGRkVSJDEsICcsJyxcclxuICAgICAgICAgICAgQklORElORywgJy5idWZmZXIuYnVmZmVyKTsnLFxyXG4gICAgICAgICAgR0wsICcudmVydGV4QXR0cmliUG9pbnRlcignLFxyXG4gICAgICAgICAgICBpLCAnLCcsXHJcbiAgICAgICAgICAgIEJJTkRJTkcsICcuc2l6ZSwnLFxyXG4gICAgICAgICAgICBCSU5ESU5HLCAnLnR5cGUsJyxcclxuICAgICAgICAgICAgQklORElORywgJy5ub3JtYWxpemVkLCcsXHJcbiAgICAgICAgICAgIEJJTkRJTkcsICcuc3RyaWRlLCcsXHJcbiAgICAgICAgICAgIEJJTkRJTkcsICcub2Zmc2V0KTsnXHJcbiAgICAgICAgKS5lbHNlKFxyXG4gICAgICAgICAgR0wsICcuZGlzYWJsZVZlcnRleEF0dHJpYkFycmF5KCcsIGksICcpOycsXHJcbiAgICAgICAgICBHTCwgJy52ZXJ0ZXhBdHRyaWI0ZignLFxyXG4gICAgICAgICAgICBpLCAnLCcsXHJcbiAgICAgICAgICAgIEJJTkRJTkcsICcueCwnLFxyXG4gICAgICAgICAgICBCSU5ESU5HLCAnLnksJyxcclxuICAgICAgICAgICAgQklORElORywgJy56LCcsXHJcbiAgICAgICAgICAgIEJJTkRJTkcsICcudyk7JyxcclxuICAgICAgICAgIEJJTkRJTkcsICcuYnVmZmVyPW51bGw7Jyk7XHJcbiAgICAgICAgcmVmcmVzaChpZnRlKTtcclxuICAgICAgICBpZiAoZXh0SW5zdGFuY2luZykge1xyXG4gICAgICAgICAgcmVmcmVzaChcclxuICAgICAgICAgICAgSU5TVEFOQ0lORywgJy52ZXJ0ZXhBdHRyaWJEaXZpc29yQU5HTEUoJyxcclxuICAgICAgICAgICAgaSwgJywnLFxyXG4gICAgICAgICAgICBCSU5ESU5HLCAnLmRpdmlzb3IpOycpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgT2JqZWN0LmtleXMoR0xfRkxBR1MpLmZvckVhY2goZnVuY3Rpb24gKGZsYWcpIHtcclxuICAgICAgICB2YXIgY2FwID0gR0xfRkxBR1NbZmxhZ107XHJcbiAgICAgICAgdmFyIE5FWFQgPSBjb21tb24uZGVmKE5FWFRfU1RBVEUsICcuJywgZmxhZyk7XHJcbiAgICAgICAgdmFyIGJsb2NrID0gZW52LmJsb2NrKCk7XHJcbiAgICAgICAgYmxvY2soJ2lmKCcsIE5FWFQsICcpeycsXHJcbiAgICAgICAgICBHTCwgJy5lbmFibGUoJywgY2FwLCAnKX1lbHNleycsXHJcbiAgICAgICAgICBHTCwgJy5kaXNhYmxlKCcsIGNhcCwgJyl9JyxcclxuICAgICAgICAgIENVUlJFTlRfU1RBVEUsICcuJywgZmxhZywgJz0nLCBORVhULCAnOycpO1xyXG4gICAgICAgIHJlZnJlc2goYmxvY2spO1xyXG4gICAgICAgIHBvbGwoXHJcbiAgICAgICAgICAnaWYoJywgTkVYVCwgJyE9PScsIENVUlJFTlRfU1RBVEUsICcuJywgZmxhZywgJyl7JyxcclxuICAgICAgICAgIGJsb2NrLFxyXG4gICAgICAgICAgJ30nKTtcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBPYmplY3Qua2V5cyhHTF9WQVJJQUJMRVMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcclxuICAgICAgICB2YXIgZnVuYyA9IEdMX1ZBUklBQkxFU1tuYW1lXTtcclxuICAgICAgICB2YXIgaW5pdCA9IGN1cnJlbnRTdGF0ZVtuYW1lXTtcclxuICAgICAgICB2YXIgTkVYVCwgQ1VSUkVOVDtcclxuICAgICAgICB2YXIgYmxvY2sgPSBlbnYuYmxvY2soKTtcclxuICAgICAgICBibG9jayhHTCwgJy4nLCBmdW5jLCAnKCcpO1xyXG4gICAgICAgIGlmIChpc0FycmF5TGlrZShpbml0KSkge1xyXG4gICAgICAgICAgdmFyIG4gPSBpbml0Lmxlbmd0aDtcclxuICAgICAgICAgIE5FWFQgPSBlbnYuZ2xvYmFsLmRlZihORVhUX1NUQVRFLCAnLicsIG5hbWUpO1xyXG4gICAgICAgICAgQ1VSUkVOVCA9IGVudi5nbG9iYWwuZGVmKENVUlJFTlRfU1RBVEUsICcuJywgbmFtZSk7XHJcbiAgICAgICAgICBibG9jayhcclxuICAgICAgICAgICAgbG9vcChuLCBmdW5jdGlvbiAoaSkge1xyXG4gICAgICAgICAgICAgIHJldHVybiBORVhUICsgJ1snICsgaSArICddJ1xyXG4gICAgICAgICAgICB9KSwgJyk7JyxcclxuICAgICAgICAgICAgbG9vcChuLCBmdW5jdGlvbiAoaSkge1xyXG4gICAgICAgICAgICAgIHJldHVybiBDVVJSRU5UICsgJ1snICsgaSArICddPScgKyBORVhUICsgJ1snICsgaSArICddOydcclxuICAgICAgICAgICAgfSkuam9pbignJykpO1xyXG4gICAgICAgICAgcG9sbChcclxuICAgICAgICAgICAgJ2lmKCcsIGxvb3AobiwgZnVuY3Rpb24gKGkpIHtcclxuICAgICAgICAgICAgICByZXR1cm4gTkVYVCArICdbJyArIGkgKyAnXSE9PScgKyBDVVJSRU5UICsgJ1snICsgaSArICddJ1xyXG4gICAgICAgICAgICB9KS5qb2luKCd8fCcpLCAnKXsnLFxyXG4gICAgICAgICAgICBibG9jayxcclxuICAgICAgICAgICAgJ30nKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgTkVYVCA9IGNvbW1vbi5kZWYoTkVYVF9TVEFURSwgJy4nLCBuYW1lKTtcclxuICAgICAgICAgIENVUlJFTlQgPSBjb21tb24uZGVmKENVUlJFTlRfU1RBVEUsICcuJywgbmFtZSk7XHJcbiAgICAgICAgICBibG9jayhcclxuICAgICAgICAgICAgTkVYVCwgJyk7JyxcclxuICAgICAgICAgICAgQ1VSUkVOVF9TVEFURSwgJy4nLCBuYW1lLCAnPScsIE5FWFQsICc7Jyk7XHJcbiAgICAgICAgICBwb2xsKFxyXG4gICAgICAgICAgICAnaWYoJywgTkVYVCwgJyE9PScsIENVUlJFTlQsICcpeycsXHJcbiAgICAgICAgICAgIGJsb2NrLFxyXG4gICAgICAgICAgICAnfScpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZWZyZXNoKGJsb2NrKTtcclxuICAgICAgfSk7XHJcblxyXG4gICAgICByZXR1cm4gZW52LmNvbXBpbGUoKVxyXG4gICAgfSkoKSxcclxuICAgIGNvbXBpbGU6IGNvbXBpbGVDb21tYW5kXHJcbiAgfVxyXG59XG5cbmZ1bmN0aW9uIHN0YXRzICgpIHtcclxuICByZXR1cm4ge1xyXG4gICAgYnVmZmVyQ291bnQ6IDAsXHJcbiAgICBlbGVtZW50c0NvdW50OiAwLFxyXG4gICAgZnJhbWVidWZmZXJDb3VudDogMCxcclxuICAgIHNoYWRlckNvdW50OiAwLFxyXG4gICAgdGV4dHVyZUNvdW50OiAwLFxyXG4gICAgY3ViZUNvdW50OiAwLFxyXG4gICAgcmVuZGVyYnVmZmVyQ291bnQ6IDAsXHJcbiAgICBtYXhUZXh0dXJlVW5pdHM6IDBcclxuICB9XHJcbn1cblxudmFyIEdMX1FVRVJZX1JFU1VMVF9FWFQgPSAweDg4NjY7XHJcbnZhciBHTF9RVUVSWV9SRVNVTFRfQVZBSUxBQkxFX0VYVCA9IDB4ODg2NztcclxudmFyIEdMX1RJTUVfRUxBUFNFRF9FWFQgPSAweDg4QkY7XHJcblxyXG52YXIgY3JlYXRlVGltZXIgPSBmdW5jdGlvbiAoZ2wsIGV4dGVuc2lvbnMpIHtcclxuICBpZiAoIWV4dGVuc2lvbnMuZXh0X2Rpc2pvaW50X3RpbWVyX3F1ZXJ5KSB7XHJcbiAgICByZXR1cm4gbnVsbFxyXG4gIH1cclxuXHJcbiAgLy8gUVVFUlkgUE9PTCBCRUdJTlxyXG4gIHZhciBxdWVyeVBvb2wgPSBbXTtcclxuICBmdW5jdGlvbiBhbGxvY1F1ZXJ5ICgpIHtcclxuICAgIHJldHVybiBxdWVyeVBvb2wucG9wKCkgfHwgZXh0ZW5zaW9ucy5leHRfZGlzam9pbnRfdGltZXJfcXVlcnkuY3JlYXRlUXVlcnlFWFQoKVxyXG4gIH1cclxuICBmdW5jdGlvbiBmcmVlUXVlcnkgKHF1ZXJ5KSB7XHJcbiAgICBxdWVyeVBvb2wucHVzaChxdWVyeSk7XHJcbiAgfVxyXG4gIC8vIFFVRVJZIFBPT0wgRU5EXHJcblxyXG4gIHZhciBwZW5kaW5nUXVlcmllcyA9IFtdO1xyXG4gIGZ1bmN0aW9uIGJlZ2luUXVlcnkgKHN0YXRzKSB7XHJcbiAgICB2YXIgcXVlcnkgPSBhbGxvY1F1ZXJ5KCk7XHJcbiAgICBleHRlbnNpb25zLmV4dF9kaXNqb2ludF90aW1lcl9xdWVyeS5iZWdpblF1ZXJ5RVhUKEdMX1RJTUVfRUxBUFNFRF9FWFQsIHF1ZXJ5KTtcclxuICAgIHBlbmRpbmdRdWVyaWVzLnB1c2gocXVlcnkpO1xyXG4gICAgcHVzaFNjb3BlU3RhdHMocGVuZGluZ1F1ZXJpZXMubGVuZ3RoIC0gMSwgcGVuZGluZ1F1ZXJpZXMubGVuZ3RoLCBzdGF0cyk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBlbmRRdWVyeSAoKSB7XHJcbiAgICBleHRlbnNpb25zLmV4dF9kaXNqb2ludF90aW1lcl9xdWVyeS5lbmRRdWVyeUVYVChHTF9USU1FX0VMQVBTRURfRVhUKTtcclxuICB9XHJcblxyXG4gIC8vXHJcbiAgLy8gUGVuZGluZyBzdGF0cyBwb29sLlxyXG4gIC8vXHJcbiAgZnVuY3Rpb24gUGVuZGluZ1N0YXRzICgpIHtcclxuICAgIHRoaXMuc3RhcnRRdWVyeUluZGV4ID0gLTE7XHJcbiAgICB0aGlzLmVuZFF1ZXJ5SW5kZXggPSAtMTtcclxuICAgIHRoaXMuc3VtID0gMDtcclxuICAgIHRoaXMuc3RhdHMgPSBudWxsO1xyXG4gIH1cclxuICB2YXIgcGVuZGluZ1N0YXRzUG9vbCA9IFtdO1xyXG4gIGZ1bmN0aW9uIGFsbG9jUGVuZGluZ1N0YXRzICgpIHtcclxuICAgIHJldHVybiBwZW5kaW5nU3RhdHNQb29sLnBvcCgpIHx8IG5ldyBQZW5kaW5nU3RhdHMoKVxyXG4gIH1cclxuICBmdW5jdGlvbiBmcmVlUGVuZGluZ1N0YXRzIChwZW5kaW5nU3RhdHMpIHtcclxuICAgIHBlbmRpbmdTdGF0c1Bvb2wucHVzaChwZW5kaW5nU3RhdHMpO1xyXG4gIH1cclxuICAvLyBQZW5kaW5nIHN0YXRzIHBvb2wgZW5kXHJcblxyXG4gIHZhciBwZW5kaW5nU3RhdHMgPSBbXTtcclxuICBmdW5jdGlvbiBwdXNoU2NvcGVTdGF0cyAoc3RhcnQsIGVuZCwgc3RhdHMpIHtcclxuICAgIHZhciBwcyA9IGFsbG9jUGVuZGluZ1N0YXRzKCk7XHJcbiAgICBwcy5zdGFydFF1ZXJ5SW5kZXggPSBzdGFydDtcclxuICAgIHBzLmVuZFF1ZXJ5SW5kZXggPSBlbmQ7XHJcbiAgICBwcy5zdW0gPSAwO1xyXG4gICAgcHMuc3RhdHMgPSBzdGF0cztcclxuICAgIHBlbmRpbmdTdGF0cy5wdXNoKHBzKTtcclxuICB9XHJcblxyXG4gIC8vIHdlIHNob3VsZCBjYWxsIHRoaXMgYXQgdGhlIGJlZ2lubmluZyBvZiB0aGUgZnJhbWUsXHJcbiAgLy8gaW4gb3JkZXIgdG8gdXBkYXRlIGdwdVRpbWVcclxuICB2YXIgdGltZVN1bSA9IFtdO1xyXG4gIHZhciBxdWVyeVB0ciA9IFtdO1xyXG4gIGZ1bmN0aW9uIHVwZGF0ZSAoKSB7XHJcbiAgICB2YXIgcHRyLCBpO1xyXG5cclxuICAgIHZhciBuID0gcGVuZGluZ1F1ZXJpZXMubGVuZ3RoO1xyXG4gICAgaWYgKG4gPT09IDApIHtcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcblxyXG4gICAgLy8gUmVzZXJ2ZSBzcGFjZVxyXG4gICAgcXVlcnlQdHIubGVuZ3RoID0gTWF0aC5tYXgocXVlcnlQdHIubGVuZ3RoLCBuICsgMSk7XHJcbiAgICB0aW1lU3VtLmxlbmd0aCA9IE1hdGgubWF4KHRpbWVTdW0ubGVuZ3RoLCBuICsgMSk7XHJcbiAgICB0aW1lU3VtWzBdID0gMDtcclxuICAgIHF1ZXJ5UHRyWzBdID0gMDtcclxuXHJcbiAgICAvLyBVcGRhdGUgYWxsIHBlbmRpbmcgdGltZXIgcXVlcmllc1xyXG4gICAgdmFyIHF1ZXJ5VGltZSA9IDA7XHJcbiAgICBwdHIgPSAwO1xyXG4gICAgZm9yIChpID0gMDsgaSA8IHBlbmRpbmdRdWVyaWVzLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgIHZhciBxdWVyeSA9IHBlbmRpbmdRdWVyaWVzW2ldO1xyXG4gICAgICBpZiAoZXh0ZW5zaW9ucy5leHRfZGlzam9pbnRfdGltZXJfcXVlcnkuZ2V0UXVlcnlPYmplY3RFWFQocXVlcnksIEdMX1FVRVJZX1JFU1VMVF9BVkFJTEFCTEVfRVhUKSkge1xyXG4gICAgICAgIHF1ZXJ5VGltZSArPSBleHRlbnNpb25zLmV4dF9kaXNqb2ludF90aW1lcl9xdWVyeS5nZXRRdWVyeU9iamVjdEVYVChxdWVyeSwgR0xfUVVFUllfUkVTVUxUX0VYVCk7XHJcbiAgICAgICAgZnJlZVF1ZXJ5KHF1ZXJ5KTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBwZW5kaW5nUXVlcmllc1twdHIrK10gPSBxdWVyeTtcclxuICAgICAgfVxyXG4gICAgICB0aW1lU3VtW2kgKyAxXSA9IHF1ZXJ5VGltZTtcclxuICAgICAgcXVlcnlQdHJbaSArIDFdID0gcHRyO1xyXG4gICAgfVxyXG4gICAgcGVuZGluZ1F1ZXJpZXMubGVuZ3RoID0gcHRyO1xyXG5cclxuICAgIC8vIFVwZGF0ZSBhbGwgcGVuZGluZyBzdGF0IHF1ZXJpZXNcclxuICAgIHB0ciA9IDA7XHJcbiAgICBmb3IgKGkgPSAwOyBpIDwgcGVuZGluZ1N0YXRzLmxlbmd0aDsgKytpKSB7XHJcbiAgICAgIHZhciBzdGF0cyA9IHBlbmRpbmdTdGF0c1tpXTtcclxuICAgICAgdmFyIHN0YXJ0ID0gc3RhdHMuc3RhcnRRdWVyeUluZGV4O1xyXG4gICAgICB2YXIgZW5kID0gc3RhdHMuZW5kUXVlcnlJbmRleDtcclxuICAgICAgc3RhdHMuc3VtICs9IHRpbWVTdW1bZW5kXSAtIHRpbWVTdW1bc3RhcnRdO1xyXG4gICAgICB2YXIgc3RhcnRQdHIgPSBxdWVyeVB0cltzdGFydF07XHJcbiAgICAgIHZhciBlbmRQdHIgPSBxdWVyeVB0cltlbmRdO1xyXG4gICAgICBpZiAoZW5kUHRyID09PSBzdGFydFB0cikge1xyXG4gICAgICAgIHN0YXRzLnN0YXRzLmdwdVRpbWUgKz0gc3RhdHMuc3VtIC8gMWU2O1xyXG4gICAgICAgIGZyZWVQZW5kaW5nU3RhdHMoc3RhdHMpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHN0YXRzLnN0YXJ0UXVlcnlJbmRleCA9IHN0YXJ0UHRyO1xyXG4gICAgICAgIHN0YXRzLmVuZFF1ZXJ5SW5kZXggPSBlbmRQdHI7XHJcbiAgICAgICAgcGVuZGluZ1N0YXRzW3B0cisrXSA9IHN0YXRzO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBwZW5kaW5nU3RhdHMubGVuZ3RoID0gcHRyO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIGJlZ2luUXVlcnk6IGJlZ2luUXVlcnksXHJcbiAgICBlbmRRdWVyeTogZW5kUXVlcnksXHJcbiAgICBwdXNoU2NvcGVTdGF0czogcHVzaFNjb3BlU3RhdHMsXHJcbiAgICB1cGRhdGU6IHVwZGF0ZSxcclxuICAgIGdldE51bVBlbmRpbmdRdWVyaWVzOiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgIHJldHVybiBwZW5kaW5nUXVlcmllcy5sZW5ndGhcclxuICAgIH0sXHJcbiAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xyXG4gICAgICBxdWVyeVBvb2wucHVzaC5hcHBseShxdWVyeVBvb2wsIHBlbmRpbmdRdWVyaWVzKTtcclxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBxdWVyeVBvb2wubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBleHRlbnNpb25zLmV4dF9kaXNqb2ludF90aW1lcl9xdWVyeS5kZWxldGVRdWVyeUVYVChxdWVyeVBvb2xbaV0pO1xyXG4gICAgICB9XHJcbiAgICAgIHBlbmRpbmdRdWVyaWVzLmxlbmd0aCA9IDA7XHJcbiAgICAgIHF1ZXJ5UG9vbC5sZW5ndGggPSAwO1xyXG4gICAgfSxcclxuICAgIHJlc3RvcmU6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgcGVuZGluZ1F1ZXJpZXMubGVuZ3RoID0gMDtcclxuICAgICAgcXVlcnlQb29sLmxlbmd0aCA9IDA7XHJcbiAgICB9XHJcbiAgfVxyXG59O1xuXG52YXIgR0xfQ09MT1JfQlVGRkVSX0JJVCA9IDE2Mzg0O1xyXG52YXIgR0xfREVQVEhfQlVGRkVSX0JJVCA9IDI1NjtcclxudmFyIEdMX1NURU5DSUxfQlVGRkVSX0JJVCA9IDEwMjQ7XHJcblxyXG52YXIgR0xfQVJSQVlfQlVGRkVSID0gMzQ5NjI7XHJcblxyXG52YXIgQ09OVEVYVF9MT1NUX0VWRU5UID0gJ3dlYmdsY29udGV4dGxvc3QnO1xyXG52YXIgQ09OVEVYVF9SRVNUT1JFRF9FVkVOVCA9ICd3ZWJnbGNvbnRleHRyZXN0b3JlZCc7XHJcblxyXG52YXIgRFlOX1BST1AgPSAxO1xyXG52YXIgRFlOX0NPTlRFWFQgPSAyO1xyXG52YXIgRFlOX1NUQVRFID0gMztcclxuXHJcbmZ1bmN0aW9uIGZpbmQgKGhheXN0YWNrLCBuZWVkbGUpIHtcclxuICBmb3IgKHZhciBpID0gMDsgaSA8IGhheXN0YWNrLmxlbmd0aDsgKytpKSB7XHJcbiAgICBpZiAoaGF5c3RhY2tbaV0gPT09IG5lZWRsZSkge1xyXG4gICAgICByZXR1cm4gaVxyXG4gICAgfVxyXG4gIH1cclxuICByZXR1cm4gLTFcclxufVxyXG5cclxuZnVuY3Rpb24gd3JhcFJFR0wgKGFyZ3MpIHtcclxuICB2YXIgY29uZmlnID0gcGFyc2VBcmdzKGFyZ3MpO1xyXG4gIGlmICghY29uZmlnKSB7XHJcbiAgICByZXR1cm4gbnVsbFxyXG4gIH1cclxuXHJcbiAgdmFyIGdsID0gY29uZmlnLmdsO1xyXG4gIHZhciBnbEF0dHJpYnV0ZXMgPSBnbC5nZXRDb250ZXh0QXR0cmlidXRlcygpO1xyXG4gIHZhciBjb250ZXh0TG9zdCA9IGdsLmlzQ29udGV4dExvc3QoKTtcclxuXHJcbiAgdmFyIGV4dGVuc2lvblN0YXRlID0gY3JlYXRlRXh0ZW5zaW9uQ2FjaGUoZ2wsIGNvbmZpZyk7XHJcbiAgaWYgKCFleHRlbnNpb25TdGF0ZSkge1xyXG4gICAgcmV0dXJuIG51bGxcclxuICB9XHJcblxyXG4gIHZhciBzdHJpbmdTdG9yZSA9IGNyZWF0ZVN0cmluZ1N0b3JlKCk7XHJcbiAgdmFyIHN0YXRzJCQxID0gc3RhdHMoKTtcclxuICB2YXIgZXh0ZW5zaW9ucyA9IGV4dGVuc2lvblN0YXRlLmV4dGVuc2lvbnM7XHJcbiAgdmFyIHRpbWVyID0gY3JlYXRlVGltZXIoZ2wsIGV4dGVuc2lvbnMpO1xyXG5cclxuICB2YXIgU1RBUlRfVElNRSA9IGNsb2NrKCk7XHJcbiAgdmFyIFdJRFRIID0gZ2wuZHJhd2luZ0J1ZmZlcldpZHRoO1xyXG4gIHZhciBIRUlHSFQgPSBnbC5kcmF3aW5nQnVmZmVySGVpZ2h0O1xyXG5cclxuICB2YXIgY29udGV4dFN0YXRlID0ge1xyXG4gICAgdGljazogMCxcclxuICAgIHRpbWU6IDAsXHJcbiAgICB2aWV3cG9ydFdpZHRoOiBXSURUSCxcclxuICAgIHZpZXdwb3J0SGVpZ2h0OiBIRUlHSFQsXHJcbiAgICBmcmFtZWJ1ZmZlcldpZHRoOiBXSURUSCxcclxuICAgIGZyYW1lYnVmZmVySGVpZ2h0OiBIRUlHSFQsXHJcbiAgICBkcmF3aW5nQnVmZmVyV2lkdGg6IFdJRFRILFxyXG4gICAgZHJhd2luZ0J1ZmZlckhlaWdodDogSEVJR0hULFxyXG4gICAgcGl4ZWxSYXRpbzogY29uZmlnLnBpeGVsUmF0aW9cclxuICB9O1xyXG4gIHZhciB1bmlmb3JtU3RhdGUgPSB7fTtcclxuICB2YXIgZHJhd1N0YXRlID0ge1xyXG4gICAgZWxlbWVudHM6IG51bGwsXHJcbiAgICBwcmltaXRpdmU6IDQsIC8vIEdMX1RSSUFOR0xFU1xyXG4gICAgY291bnQ6IC0xLFxyXG4gICAgb2Zmc2V0OiAwLFxyXG4gICAgaW5zdGFuY2VzOiAtMVxyXG4gIH07XHJcblxyXG4gIHZhciBsaW1pdHMgPSB3cmFwTGltaXRzKGdsLCBleHRlbnNpb25zKTtcclxuICB2YXIgYXR0cmlidXRlU3RhdGUgPSB3cmFwQXR0cmlidXRlU3RhdGUoXHJcbiAgICBnbCxcclxuICAgIGV4dGVuc2lvbnMsXHJcbiAgICBsaW1pdHMsXHJcbiAgICBzdHJpbmdTdG9yZSk7XHJcbiAgdmFyIGJ1ZmZlclN0YXRlID0gd3JhcEJ1ZmZlclN0YXRlKFxyXG4gICAgZ2wsXHJcbiAgICBzdGF0cyQkMSxcclxuICAgIGNvbmZpZyxcclxuICAgIGF0dHJpYnV0ZVN0YXRlKTtcclxuICB2YXIgZWxlbWVudFN0YXRlID0gd3JhcEVsZW1lbnRzU3RhdGUoZ2wsIGV4dGVuc2lvbnMsIGJ1ZmZlclN0YXRlLCBzdGF0cyQkMSk7XHJcbiAgdmFyIHNoYWRlclN0YXRlID0gd3JhcFNoYWRlclN0YXRlKGdsLCBzdHJpbmdTdG9yZSwgc3RhdHMkJDEsIGNvbmZpZyk7XHJcbiAgdmFyIHRleHR1cmVTdGF0ZSA9IGNyZWF0ZVRleHR1cmVTZXQoXHJcbiAgICBnbCxcclxuICAgIGV4dGVuc2lvbnMsXHJcbiAgICBsaW1pdHMsXHJcbiAgICBmdW5jdGlvbiAoKSB7IGNvcmUucHJvY3MucG9sbCgpOyB9LFxyXG4gICAgY29udGV4dFN0YXRlLFxyXG4gICAgc3RhdHMkJDEsXHJcbiAgICBjb25maWcpO1xyXG4gIHZhciByZW5kZXJidWZmZXJTdGF0ZSA9IHdyYXBSZW5kZXJidWZmZXJzKGdsLCBleHRlbnNpb25zLCBsaW1pdHMsIHN0YXRzJCQxLCBjb25maWcpO1xyXG4gIHZhciBmcmFtZWJ1ZmZlclN0YXRlID0gd3JhcEZCT1N0YXRlKFxyXG4gICAgZ2wsXHJcbiAgICBleHRlbnNpb25zLFxyXG4gICAgbGltaXRzLFxyXG4gICAgdGV4dHVyZVN0YXRlLFxyXG4gICAgcmVuZGVyYnVmZmVyU3RhdGUsXHJcbiAgICBzdGF0cyQkMSk7XHJcbiAgdmFyIGNvcmUgPSByZWdsQ29yZShcclxuICAgIGdsLFxyXG4gICAgc3RyaW5nU3RvcmUsXHJcbiAgICBleHRlbnNpb25zLFxyXG4gICAgbGltaXRzLFxyXG4gICAgYnVmZmVyU3RhdGUsXHJcbiAgICBlbGVtZW50U3RhdGUsXHJcbiAgICB0ZXh0dXJlU3RhdGUsXHJcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLFxyXG4gICAgdW5pZm9ybVN0YXRlLFxyXG4gICAgYXR0cmlidXRlU3RhdGUsXHJcbiAgICBzaGFkZXJTdGF0ZSxcclxuICAgIGRyYXdTdGF0ZSxcclxuICAgIGNvbnRleHRTdGF0ZSxcclxuICAgIHRpbWVyLFxyXG4gICAgY29uZmlnKTtcclxuICB2YXIgcmVhZFBpeGVscyA9IHdyYXBSZWFkUGl4ZWxzKFxyXG4gICAgZ2wsXHJcbiAgICBmcmFtZWJ1ZmZlclN0YXRlLFxyXG4gICAgY29yZS5wcm9jcy5wb2xsLFxyXG4gICAgY29udGV4dFN0YXRlLFxyXG4gICAgZ2xBdHRyaWJ1dGVzLCBleHRlbnNpb25zLCBsaW1pdHMpO1xyXG5cclxuICB2YXIgbmV4dFN0YXRlID0gY29yZS5uZXh0O1xyXG4gIHZhciBjYW52YXMgPSBnbC5jYW52YXM7XHJcblxyXG4gIHZhciByYWZDYWxsYmFja3MgPSBbXTtcclxuICB2YXIgbG9zc0NhbGxiYWNrcyA9IFtdO1xyXG4gIHZhciByZXN0b3JlQ2FsbGJhY2tzID0gW107XHJcbiAgdmFyIGRlc3Ryb3lDYWxsYmFja3MgPSBbY29uZmlnLm9uRGVzdHJveV07XHJcblxyXG4gIHZhciBhY3RpdmVSQUYgPSBudWxsO1xyXG4gIGZ1bmN0aW9uIGhhbmRsZVJBRiAoKSB7XHJcbiAgICBpZiAocmFmQ2FsbGJhY2tzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICBpZiAodGltZXIpIHtcclxuICAgICAgICB0aW1lci51cGRhdGUoKTtcclxuICAgICAgfVxyXG4gICAgICBhY3RpdmVSQUYgPSBudWxsO1xyXG4gICAgICByZXR1cm5cclxuICAgIH1cclxuXHJcbiAgICAvLyBzY2hlZHVsZSBuZXh0IGFuaW1hdGlvbiBmcmFtZVxyXG4gICAgYWN0aXZlUkFGID0gcmFmLm5leHQoaGFuZGxlUkFGKTtcclxuXHJcbiAgICAvLyBwb2xsIGZvciBjaGFuZ2VzXHJcbiAgICBwb2xsKCk7XHJcblxyXG4gICAgLy8gZmlyZSBhIGNhbGxiYWNrIGZvciBhbGwgcGVuZGluZyByYWZzXHJcbiAgICBmb3IgKHZhciBpID0gcmFmQ2FsbGJhY2tzLmxlbmd0aCAtIDE7IGkgPj0gMDsgLS1pKSB7XHJcbiAgICAgIHZhciBjYiA9IHJhZkNhbGxiYWNrc1tpXTtcclxuICAgICAgaWYgKGNiKSB7XHJcbiAgICAgICAgY2IoY29udGV4dFN0YXRlLCBudWxsLCAwKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIGZsdXNoIGFsbCBwZW5kaW5nIHdlYmdsIGNhbGxzXHJcbiAgICBnbC5mbHVzaCgpO1xyXG5cclxuICAgIC8vIHBvbGwgR1BVIHRpbWVycyAqYWZ0ZXIqIGdsLmZsdXNoIHNvIHdlIGRvbid0IGRlbGF5IGNvbW1hbmQgZGlzcGF0Y2hcclxuICAgIGlmICh0aW1lcikge1xyXG4gICAgICB0aW1lci51cGRhdGUoKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHN0YXJ0UkFGICgpIHtcclxuICAgIGlmICghYWN0aXZlUkFGICYmIHJhZkNhbGxiYWNrcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgIGFjdGl2ZVJBRiA9IHJhZi5uZXh0KGhhbmRsZVJBRik7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBzdG9wUkFGICgpIHtcclxuICAgIGlmIChhY3RpdmVSQUYpIHtcclxuICAgICAgcmFmLmNhbmNlbChoYW5kbGVSQUYpO1xyXG4gICAgICBhY3RpdmVSQUYgPSBudWxsO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gaGFuZGxlQ29udGV4dExvc3MgKGV2ZW50KSB7XHJcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xyXG5cclxuICAgIC8vIHNldCBjb250ZXh0IGxvc3QgZmxhZ1xyXG4gICAgY29udGV4dExvc3QgPSB0cnVlO1xyXG5cclxuICAgIC8vIHBhdXNlIHJlcXVlc3QgYW5pbWF0aW9uIGZyYW1lXHJcbiAgICBzdG9wUkFGKCk7XHJcblxyXG4gICAgLy8gbG9zZSBjb250ZXh0XHJcbiAgICBsb3NzQ2FsbGJhY2tzLmZvckVhY2goZnVuY3Rpb24gKGNiKSB7XHJcbiAgICAgIGNiKCk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGhhbmRsZUNvbnRleHRSZXN0b3JlZCAoZXZlbnQpIHtcclxuICAgIC8vIGNsZWFyIGVycm9yIGNvZGVcclxuICAgIGdsLmdldEVycm9yKCk7XHJcblxyXG4gICAgLy8gY2xlYXIgY29udGV4dCBsb3N0IGZsYWdcclxuICAgIGNvbnRleHRMb3N0ID0gZmFsc2U7XHJcblxyXG4gICAgLy8gcmVmcmVzaCBzdGF0ZVxyXG4gICAgZXh0ZW5zaW9uU3RhdGUucmVzdG9yZSgpO1xyXG4gICAgc2hhZGVyU3RhdGUucmVzdG9yZSgpO1xyXG4gICAgYnVmZmVyU3RhdGUucmVzdG9yZSgpO1xyXG4gICAgdGV4dHVyZVN0YXRlLnJlc3RvcmUoKTtcclxuICAgIHJlbmRlcmJ1ZmZlclN0YXRlLnJlc3RvcmUoKTtcclxuICAgIGZyYW1lYnVmZmVyU3RhdGUucmVzdG9yZSgpO1xyXG4gICAgaWYgKHRpbWVyKSB7XHJcbiAgICAgIHRpbWVyLnJlc3RvcmUoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyByZWZyZXNoIHN0YXRlXHJcbiAgICBjb3JlLnByb2NzLnJlZnJlc2goKTtcclxuXHJcbiAgICAvLyByZXN0YXJ0IFJBRlxyXG4gICAgc3RhcnRSQUYoKTtcclxuXHJcbiAgICAvLyByZXN0b3JlIGNvbnRleHRcclxuICAgIHJlc3RvcmVDYWxsYmFja3MuZm9yRWFjaChmdW5jdGlvbiAoY2IpIHtcclxuICAgICAgY2IoKTtcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgaWYgKGNhbnZhcykge1xyXG4gICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoQ09OVEVYVF9MT1NUX0VWRU5ULCBoYW5kbGVDb250ZXh0TG9zcywgZmFsc2UpO1xyXG4gICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoQ09OVEVYVF9SRVNUT1JFRF9FVkVOVCwgaGFuZGxlQ29udGV4dFJlc3RvcmVkLCBmYWxzZSk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBkZXN0cm95ICgpIHtcclxuICAgIHJhZkNhbGxiYWNrcy5sZW5ndGggPSAwO1xyXG4gICAgc3RvcFJBRigpO1xyXG5cclxuICAgIGlmIChjYW52YXMpIHtcclxuICAgICAgY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoQ09OVEVYVF9MT1NUX0VWRU5ULCBoYW5kbGVDb250ZXh0TG9zcyk7XHJcbiAgICAgIGNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKENPTlRFWFRfUkVTVE9SRURfRVZFTlQsIGhhbmRsZUNvbnRleHRSZXN0b3JlZCk7XHJcbiAgICB9XHJcblxyXG4gICAgc2hhZGVyU3RhdGUuY2xlYXIoKTtcclxuICAgIGZyYW1lYnVmZmVyU3RhdGUuY2xlYXIoKTtcclxuICAgIHJlbmRlcmJ1ZmZlclN0YXRlLmNsZWFyKCk7XHJcbiAgICB0ZXh0dXJlU3RhdGUuY2xlYXIoKTtcclxuICAgIGVsZW1lbnRTdGF0ZS5jbGVhcigpO1xyXG4gICAgYnVmZmVyU3RhdGUuY2xlYXIoKTtcclxuXHJcbiAgICBpZiAodGltZXIpIHtcclxuICAgICAgdGltZXIuY2xlYXIoKTtcclxuICAgIH1cclxuXHJcbiAgICBkZXN0cm95Q2FsbGJhY2tzLmZvckVhY2goZnVuY3Rpb24gKGNiKSB7XHJcbiAgICAgIGNiKCk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGNvbXBpbGVQcm9jZWR1cmUgKG9wdGlvbnMpIHtcclxuICAgIGNoZWNrJDEoISFvcHRpb25zLCAnaW52YWxpZCBhcmdzIHRvIHJlZ2woey4uLn0pJyk7XHJcbiAgICBjaGVjayQxLnR5cGUob3B0aW9ucywgJ29iamVjdCcsICdpbnZhbGlkIGFyZ3MgdG8gcmVnbCh7Li4ufSknKTtcclxuXHJcbiAgICBmdW5jdGlvbiBmbGF0dGVuTmVzdGVkT3B0aW9ucyAob3B0aW9ucykge1xyXG4gICAgICB2YXIgcmVzdWx0ID0gZXh0ZW5kKHt9LCBvcHRpb25zKTtcclxuICAgICAgZGVsZXRlIHJlc3VsdC51bmlmb3JtcztcclxuICAgICAgZGVsZXRlIHJlc3VsdC5hdHRyaWJ1dGVzO1xyXG4gICAgICBkZWxldGUgcmVzdWx0LmNvbnRleHQ7XHJcblxyXG4gICAgICBpZiAoJ3N0ZW5jaWwnIGluIHJlc3VsdCAmJiByZXN1bHQuc3RlbmNpbC5vcCkge1xyXG4gICAgICAgIHJlc3VsdC5zdGVuY2lsLm9wQmFjayA9IHJlc3VsdC5zdGVuY2lsLm9wRnJvbnQgPSByZXN1bHQuc3RlbmNpbC5vcDtcclxuICAgICAgICBkZWxldGUgcmVzdWx0LnN0ZW5jaWwub3A7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGZ1bmN0aW9uIG1lcmdlIChuYW1lKSB7XHJcbiAgICAgICAgaWYgKG5hbWUgaW4gcmVzdWx0KSB7XHJcbiAgICAgICAgICB2YXIgY2hpbGQgPSByZXN1bHRbbmFtZV07XHJcbiAgICAgICAgICBkZWxldGUgcmVzdWx0W25hbWVdO1xyXG4gICAgICAgICAgT2JqZWN0LmtleXMoY2hpbGQpLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcclxuICAgICAgICAgICAgcmVzdWx0W25hbWUgKyAnLicgKyBwcm9wXSA9IGNoaWxkW3Byb3BdO1xyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIG1lcmdlKCdibGVuZCcpO1xyXG4gICAgICBtZXJnZSgnZGVwdGgnKTtcclxuICAgICAgbWVyZ2UoJ2N1bGwnKTtcclxuICAgICAgbWVyZ2UoJ3N0ZW5jaWwnKTtcclxuICAgICAgbWVyZ2UoJ3BvbHlnb25PZmZzZXQnKTtcclxuICAgICAgbWVyZ2UoJ3NjaXNzb3InKTtcclxuICAgICAgbWVyZ2UoJ3NhbXBsZScpO1xyXG5cclxuICAgICAgcmV0dXJuIHJlc3VsdFxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHNlcGFyYXRlRHluYW1pYyAob2JqZWN0KSB7XHJcbiAgICAgIHZhciBzdGF0aWNJdGVtcyA9IHt9O1xyXG4gICAgICB2YXIgZHluYW1pY0l0ZW1zID0ge307XHJcbiAgICAgIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChmdW5jdGlvbiAob3B0aW9uKSB7XHJcbiAgICAgICAgdmFyIHZhbHVlID0gb2JqZWN0W29wdGlvbl07XHJcbiAgICAgICAgaWYgKGR5bmFtaWMuaXNEeW5hbWljKHZhbHVlKSkge1xyXG4gICAgICAgICAgZHluYW1pY0l0ZW1zW29wdGlvbl0gPSBkeW5hbWljLnVuYm94KHZhbHVlLCBvcHRpb24pO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBzdGF0aWNJdGVtc1tvcHRpb25dID0gdmFsdWU7XHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBkeW5hbWljOiBkeW5hbWljSXRlbXMsXHJcbiAgICAgICAgc3RhdGljOiBzdGF0aWNJdGVtc1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gVHJlYXQgY29udGV4dCB2YXJpYWJsZXMgc2VwYXJhdGUgZnJvbSBvdGhlciBkeW5hbWljIHZhcmlhYmxlc1xyXG4gICAgdmFyIGNvbnRleHQgPSBzZXBhcmF0ZUR5bmFtaWMob3B0aW9ucy5jb250ZXh0IHx8IHt9KTtcclxuICAgIHZhciB1bmlmb3JtcyA9IHNlcGFyYXRlRHluYW1pYyhvcHRpb25zLnVuaWZvcm1zIHx8IHt9KTtcclxuICAgIHZhciBhdHRyaWJ1dGVzID0gc2VwYXJhdGVEeW5hbWljKG9wdGlvbnMuYXR0cmlidXRlcyB8fCB7fSk7XHJcbiAgICB2YXIgb3B0cyA9IHNlcGFyYXRlRHluYW1pYyhmbGF0dGVuTmVzdGVkT3B0aW9ucyhvcHRpb25zKSk7XHJcblxyXG4gICAgdmFyIHN0YXRzJCQxID0ge1xyXG4gICAgICBncHVUaW1lOiAwLjAsXHJcbiAgICAgIGNwdVRpbWU6IDAuMCxcclxuICAgICAgY291bnQ6IDBcclxuICAgIH07XHJcblxyXG4gICAgdmFyIGNvbXBpbGVkID0gY29yZS5jb21waWxlKG9wdHMsIGF0dHJpYnV0ZXMsIHVuaWZvcm1zLCBjb250ZXh0LCBzdGF0cyQkMSk7XHJcblxyXG4gICAgdmFyIGRyYXcgPSBjb21waWxlZC5kcmF3O1xyXG4gICAgdmFyIGJhdGNoID0gY29tcGlsZWQuYmF0Y2g7XHJcbiAgICB2YXIgc2NvcGUgPSBjb21waWxlZC5zY29wZTtcclxuXHJcbiAgICAvLyBGSVhNRTogd2Ugc2hvdWxkIG1vZGlmeSBjb2RlIGdlbmVyYXRpb24gZm9yIGJhdGNoIGNvbW1hbmRzIHNvIHRoaXNcclxuICAgIC8vIGlzbid0IG5lY2Vzc2FyeVxyXG4gICAgdmFyIEVNUFRZX0FSUkFZID0gW107XHJcbiAgICBmdW5jdGlvbiByZXNlcnZlIChjb3VudCkge1xyXG4gICAgICB3aGlsZSAoRU1QVFlfQVJSQVkubGVuZ3RoIDwgY291bnQpIHtcclxuICAgICAgICBFTVBUWV9BUlJBWS5wdXNoKG51bGwpO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBFTVBUWV9BUlJBWVxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIFJFR0xDb21tYW5kIChhcmdzLCBib2R5KSB7XHJcbiAgICAgIHZhciBpO1xyXG4gICAgICBpZiAoY29udGV4dExvc3QpIHtcclxuICAgICAgICBjaGVjayQxLnJhaXNlKCdjb250ZXh0IGxvc3QnKTtcclxuICAgICAgfVxyXG4gICAgICBpZiAodHlwZW9mIGFyZ3MgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICByZXR1cm4gc2NvcGUuY2FsbCh0aGlzLCBudWxsLCBhcmdzLCAwKVxyXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBib2R5ID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiBhcmdzID09PSAnbnVtYmVyJykge1xyXG4gICAgICAgICAgZm9yIChpID0gMDsgaSA8IGFyZ3M7ICsraSkge1xyXG4gICAgICAgICAgICBzY29wZS5jYWxsKHRoaXMsIG51bGwsIGJvZHksIGkpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgcmV0dXJuXHJcbiAgICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGFyZ3MpKSB7XHJcbiAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgYXJncy5sZW5ndGg7ICsraSkge1xyXG4gICAgICAgICAgICBzY29wZS5jYWxsKHRoaXMsIGFyZ3NbaV0sIGJvZHksIGkpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgcmV0dXJuXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIHJldHVybiBzY29wZS5jYWxsKHRoaXMsIGFyZ3MsIGJvZHksIDApXHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBhcmdzID09PSAnbnVtYmVyJykge1xyXG4gICAgICAgIGlmIChhcmdzID4gMCkge1xyXG4gICAgICAgICAgcmV0dXJuIGJhdGNoLmNhbGwodGhpcywgcmVzZXJ2ZShhcmdzIHwgMCksIGFyZ3MgfCAwKVxyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGFyZ3MpKSB7XHJcbiAgICAgICAgaWYgKGFyZ3MubGVuZ3RoKSB7XHJcbiAgICAgICAgICByZXR1cm4gYmF0Y2guY2FsbCh0aGlzLCBhcmdzLCBhcmdzLmxlbmd0aClcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcmV0dXJuIGRyYXcuY2FsbCh0aGlzLCBhcmdzKVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGV4dGVuZChSRUdMQ29tbWFuZCwge1xyXG4gICAgICBzdGF0czogc3RhdHMkJDFcclxuICAgIH0pXHJcbiAgfVxyXG5cclxuICB2YXIgc2V0RkJPID0gZnJhbWVidWZmZXJTdGF0ZS5zZXRGQk8gPSBjb21waWxlUHJvY2VkdXJlKHtcclxuICAgIGZyYW1lYnVmZmVyOiBkeW5hbWljLmRlZmluZS5jYWxsKG51bGwsIERZTl9QUk9QLCAnZnJhbWVidWZmZXInKVxyXG4gIH0pO1xyXG5cclxuICBmdW5jdGlvbiBjbGVhckltcGwgKF8sIG9wdGlvbnMpIHtcclxuICAgIHZhciBjbGVhckZsYWdzID0gMDtcclxuICAgIGNvcmUucHJvY3MucG9sbCgpO1xyXG5cclxuICAgIHZhciBjID0gb3B0aW9ucy5jb2xvcjtcclxuICAgIGlmIChjKSB7XHJcbiAgICAgIGdsLmNsZWFyQ29sb3IoK2NbMF0gfHwgMCwgK2NbMV0gfHwgMCwgK2NbMl0gfHwgMCwgK2NbM10gfHwgMCk7XHJcbiAgICAgIGNsZWFyRmxhZ3MgfD0gR0xfQ09MT1JfQlVGRkVSX0JJVDtcclxuICAgIH1cclxuICAgIGlmICgnZGVwdGgnIGluIG9wdGlvbnMpIHtcclxuICAgICAgZ2wuY2xlYXJEZXB0aCgrb3B0aW9ucy5kZXB0aCk7XHJcbiAgICAgIGNsZWFyRmxhZ3MgfD0gR0xfREVQVEhfQlVGRkVSX0JJVDtcclxuICAgIH1cclxuICAgIGlmICgnc3RlbmNpbCcgaW4gb3B0aW9ucykge1xyXG4gICAgICBnbC5jbGVhclN0ZW5jaWwob3B0aW9ucy5zdGVuY2lsIHwgMCk7XHJcbiAgICAgIGNsZWFyRmxhZ3MgfD0gR0xfU1RFTkNJTF9CVUZGRVJfQklUO1xyXG4gICAgfVxyXG5cclxuICAgIGNoZWNrJDEoISFjbGVhckZsYWdzLCAnY2FsbGVkIHJlZ2wuY2xlYXIgd2l0aCBubyBidWZmZXIgc3BlY2lmaWVkJyk7XHJcbiAgICBnbC5jbGVhcihjbGVhckZsYWdzKTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGNsZWFyIChvcHRpb25zKSB7XHJcbiAgICBjaGVjayQxKFxyXG4gICAgICB0eXBlb2Ygb3B0aW9ucyA9PT0gJ29iamVjdCcgJiYgb3B0aW9ucyxcclxuICAgICAgJ3JlZ2wuY2xlYXIoKSB0YWtlcyBhbiBvYmplY3QgYXMgaW5wdXQnKTtcclxuICAgIGlmICgnZnJhbWVidWZmZXInIGluIG9wdGlvbnMpIHtcclxuICAgICAgaWYgKG9wdGlvbnMuZnJhbWVidWZmZXIgJiZcclxuICAgICAgICAgIG9wdGlvbnMuZnJhbWVidWZmZXJfcmVnbFR5cGUgPT09ICdmcmFtZWJ1ZmZlckN1YmUnKSB7XHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCA2OyArK2kpIHtcclxuICAgICAgICAgIHNldEZCTyhleHRlbmQoe1xyXG4gICAgICAgICAgICBmcmFtZWJ1ZmZlcjogb3B0aW9ucy5mcmFtZWJ1ZmZlci5mYWNlc1tpXVxyXG4gICAgICAgICAgfSwgb3B0aW9ucyksIGNsZWFySW1wbCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHNldEZCTyhvcHRpb25zLCBjbGVhckltcGwpO1xyXG4gICAgICB9XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBjbGVhckltcGwobnVsbCwgb3B0aW9ucyk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBmcmFtZSAoY2IpIHtcclxuICAgIGNoZWNrJDEudHlwZShjYiwgJ2Z1bmN0aW9uJywgJ3JlZ2wuZnJhbWUoKSBjYWxsYmFjayBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcclxuICAgIHJhZkNhbGxiYWNrcy5wdXNoKGNiKTtcclxuXHJcbiAgICBmdW5jdGlvbiBjYW5jZWwgKCkge1xyXG4gICAgICAvLyBGSVhNRTogIHNob3VsZCB3ZSBjaGVjayBzb21ldGhpbmcgb3RoZXIgdGhhbiBlcXVhbHMgY2IgaGVyZT9cclxuICAgICAgLy8gd2hhdCBpZiBhIHVzZXIgY2FsbHMgZnJhbWUgdHdpY2Ugd2l0aCB0aGUgc2FtZSBjYWxsYmFjay4uLlxyXG4gICAgICAvL1xyXG4gICAgICB2YXIgaSA9IGZpbmQocmFmQ2FsbGJhY2tzLCBjYik7XHJcbiAgICAgIGNoZWNrJDEoaSA+PSAwLCAnY2Fubm90IGNhbmNlbCBhIGZyYW1lIHR3aWNlJyk7XHJcbiAgICAgIGZ1bmN0aW9uIHBlbmRpbmdDYW5jZWwgKCkge1xyXG4gICAgICAgIHZhciBpbmRleCA9IGZpbmQocmFmQ2FsbGJhY2tzLCBwZW5kaW5nQ2FuY2VsKTtcclxuICAgICAgICByYWZDYWxsYmFja3NbaW5kZXhdID0gcmFmQ2FsbGJhY2tzW3JhZkNhbGxiYWNrcy5sZW5ndGggLSAxXTtcclxuICAgICAgICByYWZDYWxsYmFja3MubGVuZ3RoIC09IDE7XHJcbiAgICAgICAgaWYgKHJhZkNhbGxiYWNrcy5sZW5ndGggPD0gMCkge1xyXG4gICAgICAgICAgc3RvcFJBRigpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICByYWZDYWxsYmFja3NbaV0gPSBwZW5kaW5nQ2FuY2VsO1xyXG4gICAgfVxyXG5cclxuICAgIHN0YXJ0UkFGKCk7XHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgY2FuY2VsOiBjYW5jZWxcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8vIHBvbGwgdmlld3BvcnRcclxuICBmdW5jdGlvbiBwb2xsVmlld3BvcnQgKCkge1xyXG4gICAgdmFyIHZpZXdwb3J0ID0gbmV4dFN0YXRlLnZpZXdwb3J0O1xyXG4gICAgdmFyIHNjaXNzb3JCb3ggPSBuZXh0U3RhdGUuc2Npc3Nvcl9ib3g7XHJcbiAgICB2aWV3cG9ydFswXSA9IHZpZXdwb3J0WzFdID0gc2Npc3NvckJveFswXSA9IHNjaXNzb3JCb3hbMV0gPSAwO1xyXG4gICAgY29udGV4dFN0YXRlLnZpZXdwb3J0V2lkdGggPVxyXG4gICAgICBjb250ZXh0U3RhdGUuZnJhbWVidWZmZXJXaWR0aCA9XHJcbiAgICAgIGNvbnRleHRTdGF0ZS5kcmF3aW5nQnVmZmVyV2lkdGggPVxyXG4gICAgICB2aWV3cG9ydFsyXSA9XHJcbiAgICAgIHNjaXNzb3JCb3hbMl0gPSBnbC5kcmF3aW5nQnVmZmVyV2lkdGg7XHJcbiAgICBjb250ZXh0U3RhdGUudmlld3BvcnRIZWlnaHQgPVxyXG4gICAgICBjb250ZXh0U3RhdGUuZnJhbWVidWZmZXJIZWlnaHQgPVxyXG4gICAgICBjb250ZXh0U3RhdGUuZHJhd2luZ0J1ZmZlckhlaWdodCA9XHJcbiAgICAgIHZpZXdwb3J0WzNdID1cclxuICAgICAgc2Npc3NvckJveFszXSA9IGdsLmRyYXdpbmdCdWZmZXJIZWlnaHQ7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBwb2xsICgpIHtcclxuICAgIGNvbnRleHRTdGF0ZS50aWNrICs9IDE7XHJcbiAgICBjb250ZXh0U3RhdGUudGltZSA9IG5vdygpO1xyXG4gICAgcG9sbFZpZXdwb3J0KCk7XHJcbiAgICBjb3JlLnByb2NzLnBvbGwoKTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHJlZnJlc2ggKCkge1xyXG4gICAgcG9sbFZpZXdwb3J0KCk7XHJcbiAgICBjb3JlLnByb2NzLnJlZnJlc2goKTtcclxuICAgIGlmICh0aW1lcikge1xyXG4gICAgICB0aW1lci51cGRhdGUoKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIG5vdyAoKSB7XHJcbiAgICByZXR1cm4gKGNsb2NrKCkgLSBTVEFSVF9USU1FKSAvIDEwMDAuMFxyXG4gIH1cclxuXHJcbiAgcmVmcmVzaCgpO1xyXG5cclxuICBmdW5jdGlvbiBhZGRMaXN0ZW5lciAoZXZlbnQsIGNhbGxiYWNrKSB7XHJcbiAgICBjaGVjayQxLnR5cGUoY2FsbGJhY2ssICdmdW5jdGlvbicsICdsaXN0ZW5lciBjYWxsYmFjayBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcclxuXHJcbiAgICB2YXIgY2FsbGJhY2tzO1xyXG4gICAgc3dpdGNoIChldmVudCkge1xyXG4gICAgICBjYXNlICdmcmFtZSc6XHJcbiAgICAgICAgcmV0dXJuIGZyYW1lKGNhbGxiYWNrKVxyXG4gICAgICBjYXNlICdsb3N0JzpcclxuICAgICAgICBjYWxsYmFja3MgPSBsb3NzQ2FsbGJhY2tzO1xyXG4gICAgICAgIGJyZWFrXHJcbiAgICAgIGNhc2UgJ3Jlc3RvcmUnOlxyXG4gICAgICAgIGNhbGxiYWNrcyA9IHJlc3RvcmVDYWxsYmFja3M7XHJcbiAgICAgICAgYnJlYWtcclxuICAgICAgY2FzZSAnZGVzdHJveSc6XHJcbiAgICAgICAgY2FsbGJhY2tzID0gZGVzdHJveUNhbGxiYWNrcztcclxuICAgICAgICBicmVha1xyXG4gICAgICBkZWZhdWx0OlxyXG4gICAgICAgIGNoZWNrJDEucmFpc2UoJ2ludmFsaWQgZXZlbnQsIG11c3QgYmUgb25lIG9mIGZyYW1lLGxvc3QscmVzdG9yZSxkZXN0cm95Jyk7XHJcbiAgICB9XHJcblxyXG4gICAgY2FsbGJhY2tzLnB1c2goY2FsbGJhY2spO1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgY2FuY2VsOiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjYWxsYmFja3MubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgIGlmIChjYWxsYmFja3NbaV0gPT09IGNhbGxiYWNrKSB7XHJcbiAgICAgICAgICAgIGNhbGxiYWNrc1tpXSA9IGNhbGxiYWNrc1tjYWxsYmFja3MubGVuZ3RoIC0gMV07XHJcbiAgICAgICAgICAgIGNhbGxiYWNrcy5wb3AoKTtcclxuICAgICAgICAgICAgcmV0dXJuXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICB2YXIgcmVnbCA9IGV4dGVuZChjb21waWxlUHJvY2VkdXJlLCB7XHJcbiAgICAvLyBDbGVhciBjdXJyZW50IEZCT1xyXG4gICAgY2xlYXI6IGNsZWFyLFxyXG5cclxuICAgIC8vIFNob3J0IGN1dHMgZm9yIGR5bmFtaWMgdmFyaWFibGVzXHJcbiAgICBwcm9wOiBkeW5hbWljLmRlZmluZS5iaW5kKG51bGwsIERZTl9QUk9QKSxcclxuICAgIGNvbnRleHQ6IGR5bmFtaWMuZGVmaW5lLmJpbmQobnVsbCwgRFlOX0NPTlRFWFQpLFxyXG4gICAgdGhpczogZHluYW1pYy5kZWZpbmUuYmluZChudWxsLCBEWU5fU1RBVEUpLFxyXG5cclxuICAgIC8vIGV4ZWN1dGVzIGFuIGVtcHR5IGRyYXcgY29tbWFuZFxyXG4gICAgZHJhdzogY29tcGlsZVByb2NlZHVyZSh7fSksXHJcblxyXG4gICAgLy8gUmVzb3VyY2VzXHJcbiAgICBidWZmZXI6IGZ1bmN0aW9uIChvcHRpb25zKSB7XHJcbiAgICAgIHJldHVybiBidWZmZXJTdGF0ZS5jcmVhdGUob3B0aW9ucywgR0xfQVJSQVlfQlVGRkVSLCBmYWxzZSwgZmFsc2UpXHJcbiAgICB9LFxyXG4gICAgZWxlbWVudHM6IGZ1bmN0aW9uIChvcHRpb25zKSB7XHJcbiAgICAgIHJldHVybiBlbGVtZW50U3RhdGUuY3JlYXRlKG9wdGlvbnMsIGZhbHNlKVxyXG4gICAgfSxcclxuICAgIHRleHR1cmU6IHRleHR1cmVTdGF0ZS5jcmVhdGUyRCxcclxuICAgIGN1YmU6IHRleHR1cmVTdGF0ZS5jcmVhdGVDdWJlLFxyXG4gICAgcmVuZGVyYnVmZmVyOiByZW5kZXJidWZmZXJTdGF0ZS5jcmVhdGUsXHJcbiAgICBmcmFtZWJ1ZmZlcjogZnJhbWVidWZmZXJTdGF0ZS5jcmVhdGUsXHJcbiAgICBmcmFtZWJ1ZmZlckN1YmU6IGZyYW1lYnVmZmVyU3RhdGUuY3JlYXRlQ3ViZSxcclxuXHJcbiAgICAvLyBFeHBvc2UgY29udGV4dCBhdHRyaWJ1dGVzXHJcbiAgICBhdHRyaWJ1dGVzOiBnbEF0dHJpYnV0ZXMsXHJcblxyXG4gICAgLy8gRnJhbWUgcmVuZGVyaW5nXHJcbiAgICBmcmFtZTogZnJhbWUsXHJcbiAgICBvbjogYWRkTGlzdGVuZXIsXHJcblxyXG4gICAgLy8gU3lzdGVtIGxpbWl0c1xyXG4gICAgbGltaXRzOiBsaW1pdHMsXHJcbiAgICBoYXNFeHRlbnNpb246IGZ1bmN0aW9uIChuYW1lKSB7XHJcbiAgICAgIHJldHVybiBsaW1pdHMuZXh0ZW5zaW9ucy5pbmRleE9mKG5hbWUudG9Mb3dlckNhc2UoKSkgPj0gMFxyXG4gICAgfSxcclxuXHJcbiAgICAvLyBSZWFkIHBpeGVsc1xyXG4gICAgcmVhZDogcmVhZFBpeGVscyxcclxuXHJcbiAgICAvLyBEZXN0cm95IHJlZ2wgYW5kIGFsbCBhc3NvY2lhdGVkIHJlc291cmNlc1xyXG4gICAgZGVzdHJveTogZGVzdHJveSxcclxuXHJcbiAgICAvLyBEaXJlY3QgR0wgc3RhdGUgbWFuaXB1bGF0aW9uXHJcbiAgICBfZ2w6IGdsLFxyXG4gICAgX3JlZnJlc2g6IHJlZnJlc2gsXHJcblxyXG4gICAgcG9sbDogZnVuY3Rpb24gKCkge1xyXG4gICAgICBwb2xsKCk7XHJcbiAgICAgIGlmICh0aW1lcikge1xyXG4gICAgICAgIHRpbWVyLnVwZGF0ZSgpO1xyXG4gICAgICB9XHJcbiAgICB9LFxyXG5cclxuICAgIC8vIEN1cnJlbnQgdGltZVxyXG4gICAgbm93OiBub3csXHJcblxyXG4gICAgLy8gcmVnbCBTdGF0aXN0aWNzIEluZm9ybWF0aW9uXHJcbiAgICBzdGF0czogc3RhdHMkJDFcclxuICB9KTtcclxuXHJcbiAgY29uZmlnLm9uRG9uZShudWxsLCByZWdsKTtcclxuXHJcbiAgcmV0dXJuIHJlZ2xcclxufVxuXG5yZXR1cm4gd3JhcFJFR0w7XG5cbn0pKSk7XG4vLyMgc291cmNlTWFwcGluZ1VSTD1yZWdsLmpzLm1hcFxuIiwibW9kdWxlLmV4cG9ydHMgPSAocmVnbCkgPT4ge1xuICAgIHJldHVybiByZWdsKHtcbiAgICAgICAgdmVydDogYFxuICAgICAgICAgICAgcHJlY2lzaW9uIG1lZGl1bXAgZmxvYXQ7XG4gICAgICAgICAgICBhdHRyaWJ1dGUgdmVjMiB4eTtcbiAgICAgICAgICAgIHZhcnlpbmcgdmVjMiB2VXY7XG4gICAgICAgICAgICB2b2lkIG1haW4gKCkge1xuICAgICAgICAgICAgICAgIHZVdiA9IHh5ICogMC41ICsgMC41O1xuICAgICAgICAgICAgICAgIGdsX1Bvc2l0aW9uID0gdmVjNCh4eSwgMCwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIGAsXG4gICAgICAgIGZyYWc6IGBcbiAgICAgICAgICAgIHByZWNpc2lvbiBtZWRpdW1wIGZsb2F0O1xuICAgICAgICAgICAgdmFyeWluZyB2ZWMyIHZVdjtcbiAgICAgICAgICAgIHVuaWZvcm0gdmVjNCByZWN0O1xuXG4gICAgICAgICAgICB2b2lkIG1haW4gKCkge1xuICAgICAgICAgICAgICAgIGlmICh2VXYueCA8IHJlY3QueCkgZGlzY2FyZDtcbiAgICAgICAgICAgICAgICBpZiAodlV2LnggPiByZWN0LnopIGRpc2NhcmQ7XG4gICAgICAgICAgICAgICAgaWYgKHZVdi55ID4gMS4wIC0gcmVjdC55KSBkaXNjYXJkO1xuICAgICAgICAgICAgICAgIGlmICh2VXYueSA8IDEuMCAtIHJlY3QudykgZGlzY2FyZDtcbiAgICAgICAgICAgICAgICBnbF9GcmFnQ29sb3IgPSB2ZWM0KDAuMCwgMC4wLCAwLjAsIDAuMCk7XG4gICAgICAgICAgICAgICAgLy8gaWYgKHZVdi55ID09IDEuMCAtIHJlY3QueSkge1xuICAgICAgICAgICAgICAgIC8vICAgICAvLyBnbF9GcmFnQ29sb3IgPSB2ZWM0KHJhbmQodlV2LCAxLjApLCByYW5kKHZVdiwgMi4wKSowLjI1LCByYW5kKHZVdiwgMi4wKSwgcmFuZCh2VXYsIDMuMCkqMC4yNSk7XG4gICAgICAgICAgICAgICAgLy8gfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyAgICAgLy8gZ2xfRnJhZ0NvbG9yID0gdmVjNChyYW5kKHZVdiwgMS4wKSwgcmFuZCh2VXYsIDIuMCkqMC4yNSwgcmFuZCh2VXYsIDIuMCksIHJhbmQodlV2LCAzLjApKjAuMjUpO1xuICAgICAgICAgICAgICAgIC8vICAgICAvLyBnbF9GcmFnQ29sb3IgPSB2ZWM0KDAuMCwgMC4wLCAwLjAsIDAuMCk7XG4gICAgICAgICAgICAgICAgLy8gfVxuICAgICAgICAgICAgfVxuICAgICAgICBgLFxuICAgICAgICBhdHRyaWJ1dGVzOiB7eHk6IFstNCwgLTQsIDAsIDQsIDQsIC00XX0sXG4gICAgICAgIHVuaWZvcm1zOiB7XG4gICAgICAgICAgICByZWN0OiByZWdsLnByb3AoJ3JlY3QnKVxuICAgICAgICB9LFxuICAgICAgICBmcmFtZWJ1ZmZlcjogcmVnbC5wcm9wKCdkc3QnKSxcbiAgICAgICAgZGVwdGg6IHsgZW5hYmxlOiBmYWxzZSB9LFxuICAgICAgICBjb3VudDogMyxcbiAgICB9KTtcbn0iLCJjb25zdCBnbHNsID0gcmVxdWlyZSgnZ2xzbGlmeScpXG5cbm1vZHVsZS5leHBvcnRzID0gKHJlZ2wpID0+IHtcbiAgICByZXR1cm4gcmVnbCh7XG4gICAgICAgIHZlcnQ6IGBcbiAgICAgICAgICAgIHByZWNpc2lvbiBtZWRpdW1wIGZsb2F0O1xuICAgICAgICAgICAgYXR0cmlidXRlIHZlYzIgeHk7XG4gICAgICAgICAgICB2YXJ5aW5nIHZlYzIgdXY7XG4gICAgICAgICAgICB2b2lkIG1haW4gKCkge1xuICAgICAgICAgICAgICAgIHV2ID0geHkgKiAwLjUgKyAwLjU7XG4gICAgICAgICAgICAgICAgZ2xfUG9zaXRpb24gPSB2ZWM0KHh5LCAwLCAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgYCxcbiAgICAgICAgZnJhZzogZ2xzbGBcbiAgICAgICAgICAgIHByZWNpc2lvbiBtZWRpdW1wIGZsb2F0O1xuICAgICAgICAgICAgdW5pZm9ybSBzYW1wbGVyMkQgdV9zcmM7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzIgdV9zaXplO1xuICAgICAgICAgICAgdW5pZm9ybSBmbG9hdCBzY2FsZTtcbiAgICAgICAgICAgIHZhcnlpbmcgdmVjMiB1djtcbiAgICAgICAgICAgIGNvbnN0IGZsb2F0IEYgPSAwLjAzNywgSyA9IDAuMDY7XG4gICAgICAgICAgICBmbG9hdCBEX2EgPSAwLjIqc2NhbGUsIERfYiA9IDAuMSpzY2FsZTtcblxuICAgICAgICAgICAgdm9pZCBtYWluKCkge1xuICAgICAgICAgICAgICAgIHZlYzQgbiA9IHRleHR1cmUyRCh1X3NyYywgdXYgKyB2ZWMyKDAuMCwgMS4wKSp1X3NpemUpLFxuICAgICAgICAgICAgICAgICAgICAgZSA9IHRleHR1cmUyRCh1X3NyYywgdXYgKyB2ZWMyKDEuMCwgMC4wKSp1X3NpemUpLFxuICAgICAgICAgICAgICAgICAgICAgcyA9IHRleHR1cmUyRCh1X3NyYywgdXYgKyB2ZWMyKDAuMCwgLTEuMCkqdV9zaXplKSxcbiAgICAgICAgICAgICAgICAgICAgIHcgPSB0ZXh0dXJlMkQodV9zcmMsIHV2ICsgdmVjMigtMS4wLCAwLjApKnVfc2l6ZSksXG5cbiAgICAgICAgICAgICAgICAgICAgIG5lID0gdGV4dHVyZTJEKHVfc3JjLCB1diArIHZlYzIoMS4wLCAxLjApKnVfc2l6ZSksXG4gICAgICAgICAgICAgICAgICAgICBudyA9IHRleHR1cmUyRCh1X3NyYywgdXYgKyB2ZWMyKC0xLjAsIDEuMCkqdV9zaXplKSxcbiAgICAgICAgICAgICAgICAgICAgIHNlID0gdGV4dHVyZTJEKHVfc3JjLCB1diArIHZlYzIoMS4wLCAtMS4wKSp1X3NpemUpLFxuICAgICAgICAgICAgICAgICAgICAgc3cgPSB0ZXh0dXJlMkQodV9zcmMsIHV2ICsgdmVjMigtMS4wLCAtMS4wKSp1X3NpemUpO1xuXG4gICAgICAgICAgICAgICAgdmVjNCB2YWwgPSB0ZXh0dXJlMkQodV9zcmMsIHV2KTtcblxuICAgICAgICAgICAgICAgIHZlYzQgbGFwID0gKDAuNSAqIChuICsgcyArIGUgKyB3KSArIDAuMjUgKiAobmUgKyBudyArIHNlICsgc3cpIC0gMy4wICogdmFsKTtcblxuICAgICAgICAgICAgICAgIHZhbCArPSB2ZWM0KERfYSAqIGxhcC54IC0gdmFsLngqdmFsLnkqdmFsLnkgKyBGICogKDEuMC12YWwueCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgRF9iICogbGFwLnkgKyB2YWwueCp2YWwueSp2YWwueSAtIChLK0YpICogdmFsLnksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgMS41KkRfYSAqIGxhcC56IC0gdmFsLnoqdmFsLncqdmFsLncgKyBGICogKDEuMC12YWwueiksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgMS41KkRfYiAqIGxhcC53ICsgdmFsLnoqdmFsLncqdmFsLncgLSAoSytGKSAqIHZhbC53KTtcblxuICAgICAgICAgICAgICAgIC8qICBNYWtlIHRoZSB0d28gc3lzdGVtcyBtdXR1YWxseSBleGNsdXNpdmUgYnkgaGF2aW5nIHRoZVxuICAgICAgICAgICAgICAgICAgICBkb21pbmFudCBzdXBwcmVzcyB0aGUgb3RoZXIuICovXG4gICAgICAgICAgICAgICAgaWYgKHZhbC55ID4gdmFsLncpIHtcbiAgICAgICAgICAgICAgICAgICAgZ2xfRnJhZ0NvbG9yID0gdmVjNCh2YWwueCwgdmFsLnksIHZhbC56LCB2YWwudy8yLjApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGdsX0ZyYWdDb2xvciA9IHZlYzQodmFsLngsIHZhbC55LzIuMCwgdmFsLnosIHZhbC53KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIGAsXG4gICAgICAgIGF0dHJpYnV0ZXM6IHt4eTogWy00LCAtNCwgMCwgNCwgNCwgLTRdfSxcbiAgICAgICAgdW5pZm9ybXM6IHtcbiAgICAgICAgICAgIHNjYWxlOiAwLjMsXG4gICAgICAgICAgICB1X3NyYzogcmVnbC5wcm9wKCdzcmMnKSxcbiAgICAgICAgICAgIHVfc2l6ZTogY3R4ID0+IFsxIC8gY3R4LmZyYW1lYnVmZmVyV2lkdGgsIDEgLyBjdHguZnJhbWVidWZmZXJIZWlnaHRdLFxuICAgICAgICB9LFxuICAgICAgICBmcmFtZWJ1ZmZlcjogcmVnbC5wcm9wKCdkc3QnKSxcbiAgICAgICAgZGVwdGg6IHsgZW5hYmxlOiBmYWxzZSB9LFxuICAgICAgICBjb3VudDogM1xuICAgIH0pO1xufSIsIlxuZnVuY3Rpb24gaGV4VG9SZ2IoaGV4KSB7XG4gICAgdmFyIHJlc3VsdCA9IC9eIz8oW2EtZlxcZF17Mn0pKFthLWZcXGRdezJ9KShbYS1mXFxkXXsyfSkkL2kuZXhlYyhoZXgpO1xuICAgIGlmICghcmVzdWx0KSB7IHJldHVybiBudWxsIH1cbiAgICByZXR1cm4gIFtcbiAgICAgICAgcGFyc2VJbnQocmVzdWx0WzFdLCAxNikgLyAyNTUuMCxcbiAgICAgICAgcGFyc2VJbnQocmVzdWx0WzJdLCAxNikgLyAyNTUuMCxcbiAgICAgICAgcGFyc2VJbnQocmVzdWx0WzNdLCAxNikgLyAyNTUuMCxcbiAgICAgICAgMS4wXG4gICAgXVxufVxubW9kdWxlLmV4cG9ydHMgPSAocmVnbCkgPT4ge1xuICAgIHJldHVybiByZWdsKHtcbiAgICAgICAgdmVydDogYFxuICAgICAgICAgICAgcHJlY2lzaW9uIG1lZGl1bXAgZmxvYXQ7XG4gICAgICAgICAgICBhdHRyaWJ1dGUgdmVjMiB4eTtcbiAgICAgICAgICAgIHZhcnlpbmcgdmVjMiB1djtcbiAgICAgICAgICAgIHZvaWQgbWFpbiAoKSB7XG4gICAgICAgICAgICAgICAgdXYgPSB4eSAqIDAuNSArIDAuNTtcbiAgICAgICAgICAgICAgICBnbF9Qb3NpdGlvbiA9IHZlYzQoeHksIDAsIDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICBgLFxuICAgICAgICBmcmFnOiBgXG4gICAgICAgICAgICBwcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcbiAgICAgICAgICAgIHZhcnlpbmcgdmVjMiB1djtcbiAgICAgICAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIHNyYztcbiAgICAgICAgICAgIHVuaWZvcm0gaW50IHNob3c7XG4gICAgICAgICAgICB1bmlmb3JtIHZlYzQgY29sb3JBO1xuICAgICAgICAgICAgdW5pZm9ybSB2ZWM0IGNvbG9yQjtcblxuICAgICAgICAgICAgY29uc3QgZmxvYXQgQ09MT1JfTUlOID0gMC4xNSwgQ09MT1JfTUFYID0gMC4zO1xuICAgICAgICAgICAgY29uc3QgdmVjNCBXSElURSA9IHZlYzQoIDEuMCwgMS4wLCAxLjAsIDEuMCApO1xuXG4gICAgICAgICAgICBmbG9hdCByZW1hcCggZmxvYXQgbWludmFsLCBmbG9hdCBtYXh2YWwsIGZsb2F0IGN1cnZhbCApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gKCBjdXJ2YWwgLSBtaW52YWwgKSAvICggbWF4dmFsIC0gbWludmFsICk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZvaWQgbWFpbigpIHtcbiAgICAgICAgICAgICAgICB2ZWM0IHBpeGVsID0gdGV4dHVyZTJEKHNyYywgdXYpO1xuICAgICAgICAgICAgICAgIGZsb2F0IHYxID0gcmVtYXAoQ09MT1JfTUlOLCBDT0xPUl9NQVgsIHBpeGVsLnkpO1xuICAgICAgICAgICAgICAgIGZsb2F0IHYyID0gcmVtYXAoQ09MT1JfTUlOLCBDT0xPUl9NQVgsIHBpeGVsLncpO1xuXG4gICAgICAgICAgICAgICAgaWYgKHNob3cgPT0gMSkge1xuICAgICAgICAgICAgICAgICAgICBnbF9GcmFnQ29sb3IgPSBtaXgoIFdISVRFLCBjb2xvckEsIHYxICk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChzaG93ID09IDIpIHtcbiAgICAgICAgICAgICAgICAgICAgZ2xfRnJhZ0NvbG9yID0gbWl4KCBXSElURSwgY29sb3JCLCB2MiApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoc2hvdyA9PSAzKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh2MiA8IHYxKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBnbF9GcmFnQ29sb3IgPSBtaXgoIFdISVRFLCBjb2xvckEsIHYxICk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBnbF9GcmFnQ29sb3IgPSBtaXgoIFdISVRFLCBjb2xvckIsIHYyICk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBnbF9GcmFnQ29sb3IgPSB2ZWM0KDEsIDEsIDEsIDEpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgYCxcbiAgICAgICAgdW5pZm9ybXM6IHtcbiAgICAgICAgICAgIGNvbG9yQTogcmVnbC5wcm9wKCdjb2xvckEnKSwvL2hleFRvUmdiKFwiIzAwMDBlMFwiKSxcbiAgICAgICAgICAgIGNvbG9yQjogcmVnbC5wcm9wKCdjb2xvckInKSxcbiAgICAgICAgICAgIHNyYzogcmVnbC5wcm9wKCdzcmMnKSxcbiAgICAgICAgICAgIHNob3c6IDMsXG4gICAgICAgIH0sXG4gICAgICAgIGF0dHJpYnV0ZXM6IHt4eTogWy00LCAtNCwgMCwgNCwgNCwgLTRdfSxcbiAgICAgICAgZGVwdGg6IHtlbmFibGU6IGZhbHNlfSxcbiAgICAgICAgY291bnQ6IDNcbiAgICB9KTtcbn0iLCJtb2R1bGUuZXhwb3J0cyA9IChyZWdsKSA9PiB7XG4gICAgcmV0dXJuIHJlZ2woe1xuICAgICAgICB2ZXJ0OiBgXG4gICAgICAgICAgICBwcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcbiAgICAgICAgICAgIGF0dHJpYnV0ZSB2ZWMyIHh5O1xuICAgICAgICAgICAgdmFyeWluZyB2ZWMyIHV2O1xuICAgICAgICAgICAgdm9pZCBtYWluICgpIHtcbiAgICAgICAgICAgICAgICB1diA9IHh5ICogMC41ICsgMC41O1xuICAgICAgICAgICAgICAgIHV2LnkgPSAxLjAtdXYueTtcbiAgICAgICAgICAgICAgICBnbF9Qb3NpdGlvbiA9IHZlYzQoeHksIDAsIDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICBgLFxuICAgICAgICBmcmFnOiBgXG4gICAgICAgICAgICBwcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcbiAgICAgICAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIHRleHR1cmU7XG4gICAgICAgICAgICB1bmlmb3JtIHNhbXBsZXIyRCByYW5kb207XG4gICAgICAgICAgICB2YXJ5aW5nIHZlYzIgdXY7XG5cbiAgICAgICAgICAgIHZvaWQgbWFpbiAoKSB7XG4gICAgICAgICAgICAgICAgdmVjNCB2YWwgPSB0ZXh0dXJlMkQodGV4dHVyZSwgdXYpO1xuICAgICAgICAgICAgICAgIHZlYzQgcmFuZCA9IHRleHR1cmUyRChyYW5kb20sIHV2KTtcblxuICAgICAgICAgICAgICAgIHZlYzQgcmVzdWx0ID0gdmVjNCgxLjAsIDAuMCwgMS4wLCAwLjApO1xuXG4gICAgICAgICAgICAgICAgaWYgKHZhbC5nID4gMC41ICYmIHJhbmQueCA+IDAuNSkge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQueCA9IDAuNTtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0LnkgPSAwLjI1O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAodmFsLnIgPiAwLjUgJiYgcmFuZC55ID4gMC43KSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdC56ID0gMC41O1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQudyA9IDAuMjU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGdsX0ZyYWdDb2xvciA9IHJlc3VsdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgYCxcbiAgICAgICAgYXR0cmlidXRlczoge3h5OiBbLTQsIC00LCAwLCA0LCA0LCAtNF19LFxuICAgICAgICB1bmlmb3Jtczoge1xuICAgICAgICAgICAgdGV4dHVyZTogcmVnbC5wcm9wKCd0ZXh0dXJlJyksXG4gICAgICAgICAgICByYW5kb206IHJlZ2wucHJvcCgncmFuZG9tJylcbiAgICAgICAgfSxcbiAgICAgICAgZnJhbWVidWZmZXI6IHJlZ2wucHJvcCgnZHN0JyksXG4gICAgICAgIGRlcHRoOiB7IGVuYWJsZTogZmFsc2UgfSxcbiAgICAgICAgY291bnQ6IDMsXG4gICAgfSk7XG59IiwibW9kdWxlLmV4cG9ydHMgPSAocmVnbCkgPT4ge1xuICAgIHJldHVybiByZWdsKHtcbiAgICAgICAgdmVydDogYFxuICAgICAgICAgICAgcHJlY2lzaW9uIG1lZGl1bXAgZmxvYXQ7XG4gICAgICAgICAgICBhdHRyaWJ1dGUgdmVjMiB4eTtcbiAgICAgICAgICAgIHZhcnlpbmcgdmVjMiB1djtcbiAgICAgICAgICAgIHZvaWQgbWFpbiAoKSB7XG4gICAgICAgICAgICAgICAgdXYgPSB4eSAqIDAuNSArIDAuNTtcbiAgICAgICAgICAgICAgICB1di55ID0gMS4wIC0gdXYueTtcbiAgICAgICAgICAgICAgICBnbF9Qb3NpdGlvbiA9IHZlYzQoeHksIDAsIDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICBgLFxuICAgICAgICBmcmFnOiBgXG4gICAgICAgICAgICBwcmVjaXNpb24gbWVkaXVtcCBmbG9hdDtcbiAgICAgICAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIHVfc3JjO1xuICAgICAgICAgICAgdW5pZm9ybSBzYW1wbGVyMkQgb2xkX3RleHR1cmU7XG4gICAgICAgICAgICB1bmlmb3JtIHNhbXBsZXIyRCBuZXdfdGV4dHVyZTtcbiAgICAgICAgICAgIHVuaWZvcm0gc2FtcGxlcjJEIHJhbmRvbTtcbiAgICAgICAgICAgIHZhcnlpbmcgdmVjMiB1djtcbiAgICAgICAgICAgIHZvaWQgbWFpbiAoKSB7XG4gICAgICAgICAgICAgICAgdmVjNCBvbGR2ID0gdGV4dHVyZTJEKHVfc3JjLCB1dik7XG4gICAgICAgICAgICAgICAgYm9vbCBvbGRfdGV4dCA9IG9sZHYueSA+IDAuMjtcbiAgICAgICAgICAgICAgICBib29sIG5ld19zZWVkID0gdGV4dHVyZTJEKG5ld190ZXh0dXJlLCB1dikuZyA+IDAuMjtcbiAgICAgICAgICAgICAgICBib29sIG5ld19ib3VuZCA9IHRleHR1cmUyRChuZXdfdGV4dHVyZSwgdXYpLnIgPiAwLjI7XG4gICAgICAgICAgICAgICAgYm9vbCBvbGRfc2VlZCA9IHRleHR1cmUyRChvbGRfdGV4dHVyZSwgdXYpLmcgPiAwLjI7XG4gICAgICAgICAgICAgICAgYm9vbCBvbGRfYm91bmQgPSB0ZXh0dXJlMkQob2xkX3RleHR1cmUsIHV2KS5yID4gMC4yO1xuICAgICAgICAgICAgICAgIHZlYzQgcmVzdWx0ID0gb2xkdjtcbiAgICAgICAgICAgICAgICB2ZWM0IHJhbmQgPSB0ZXh0dXJlMkQocmFuZG9tLCB1dik7XG5cbiAgICAgICAgICAgICAgICAvKiBDbGVhciBtb3JwaDIgdG8gYWxsb3cgbW9ycGgxIHRvIGdyb3cuXG4gICAgICAgICAgICAgICAgKi9cbiAgICAgICAgICAgICAgICBpZiAoIW5ld19ib3VuZCkge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQuencgPSB2ZWMyKDEuMCwgMC4wKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAobmV3X3NlZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJhbmQueCA+IDAuOCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0Lnh5ID0gdmVjMigwLjUsIDAuMjUpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0Lnh5ID0gdmVjMigxLjAsIDAuMCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAob2xkX3RleHQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0Lnh5ID0gdmVjMigxLjAsIDAuMCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKG5ld19ib3VuZCkge1xuICAgICAgICAgICAgICAgIC8vIGlmICghb2xkX2JvdW5kICYmIG5ld19ib3VuZCB8fCBvbGRfc2VlZCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAocmFuZC55ID4gMC45KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQuencgPSB2ZWMyKDAuNSwgMC4yNSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQuencgPSB2ZWMyKDEuMCwgMC4wKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBnbF9GcmFnQ29sb3IgPSByZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIGAsXG4gICAgICAgIGF0dHJpYnV0ZXM6IHt4eTogWy00LCAtNCwgMCwgNCwgNCwgLTRdfSxcbiAgICAgICAgdW5pZm9ybXM6IHtcbiAgICAgICAgICAgIHVfc3JjOiByZWdsLnByb3AoJ3NyYycpLFxuICAgICAgICAgICAgb2xkX3RleHR1cmU6IHJlZ2wucHJvcCgnb2xkX3RleHR1cmUnKSxcbiAgICAgICAgICAgIG5ld190ZXh0dXJlOiByZWdsLnByb3AoJ25ld190ZXh0dXJlJyksXG4gICAgICAgICAgICByYW5kb206IHJlZ2wucHJvcCgncmFuZG9tJylcbiAgICAgICAgICAgIC8vIHJlZ2wudGV4dHVyZSh7XG4gICAgICAgICAgICAvLyAgICAgd2lkdGg6IDUxMiwgaGVpZ2h0OiAyNTYsIGRhdGE6IHJhbmRvbV9saXN0KDUxMioyNTYqNClcbiAgICAgICAgICAgIC8vIH0pXG4gICAgICAgIH0sXG4gICAgICAgIGZyYW1lYnVmZmVyOiByZWdsLnByb3AoJ2RzdCcpLFxuICAgICAgICBkZXB0aDoge2VuYWJsZTogZmFsc2V9LFxuICAgICAgICBjb3VudDogMyxcbiAgICB9KTtcbn0iXX0=
