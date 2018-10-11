
var toHalf = (function() {

  var floatView = new Float32Array(1);
  var int32View = new Int32Array(floatView.buffer);

  return function toHalf( fval ) {
    floatView[0] = fval;
    var fbits = int32View[0];
    var sign  = (fbits >> 16) & 0x8000;          // sign only
    var val   = ( fbits & 0x7fffffff ) + 0x1000; // rounded value

    if( val >= 0x47800000 ) {             // might be or become NaN/Inf
      if( ( fbits & 0x7fffffff ) >= 0x47800000 ) {
                                          // is or must become NaN/Inf
        if( val < 0x7f800000 ) {          // was value but too large
          return sign | 0x7c00;           // make it +/-Inf
        }
        return sign | 0x7c00 |            // remains +/-Inf or NaN
            ( fbits & 0x007fffff ) >> 13; // keep NaN (and Inf) bits
      }
      return sign | 0x7bff;               // unrounded not quite Inf
    }
    if( val >= 0x38800000 ) {             // remains normalized value
      return sign | val - 0x38000000 >> 13; // exp - 127 + 15
    }
    if( val < 0x33000000 )  {             // too small for subnormal
      return sign;                        // becomes +/-0
    }
    val = ( fbits & 0x7fffffff ) >> 23;   // tmp exp for subnormal calc
    return sign | ( ( fbits & 0x7fffff | 0x800000 ) // add subnormal bit
         + ( 0x800000 >>> val - 102 )     // round depending on cut off
         >> 126 - val );                  // div by 2^(1-(exp-127+15)) and >> 13 | exp=0
  };
}());


// function arr_half(arr) {
//     // return arr
//     if (!arr) {
//         return null
//     }
//     console.log(arr)
//     let result = new Uint16Array(arr.length)
//     for (var i = 0; i < arr.length; i++) {
//         result[i] = toHalf(arr[i])
//     }
//     console.log(result)
//     return result
// }

function write_texture(gl, texture, array) {
    gl.bindTexture(gl.TEXTURE_2D, texture)
    // gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, HALF_FLOAT, arr_half(array))
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.FLOAT, array)
}

// Create, initialise, and bind a new texture
function newTexture(gl, initial_state) {
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // This allows it to be a non power of 2 texture.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, HALF_FLOAT, arr_half(initial_state));
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.FLOAT, initial_state);

    return texture;
}

function newFramebuffer(gl, texture) {
    var fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    return fb;
}

function loadVertexData(gl, prog) {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([ -1,-1, 1,-1, -1,1, 1,1 ]), gl.STATIC_DRAW);

    var a_position = gl.getAttribLocation(prog, "a_position");
    gl.enableVertexAttribArray(a_position);
    gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, 0, 0);
}

function createAndLinkProgram(gl, vertex_shader, fragment_shader) {
    var prog = gl.createProgram();
    gl.attachShader(prog, vertex_shader);
    gl.attachShader(prog, fragment_shader);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        fail("Failed to link program: " + gl.getProgramInfoLog(prog));
    }
    return prog;
}

function createShader(gl, shader_type, shader_code_id) {
    var shader = gl.createShader(shader_type);
    gl.shaderSource(shader, document.getElementById(shader_code_id).text);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        var err = gl.getShaderInfoLog(shader);
        fail("Failed to compile shader: " + err);
    }
    return shader
}

function checkCompatibility(gl) {
    if (!gl) {
        fail("WebGL is not supported");
    }

    if (!gl.getExtension("OES_texture_float")) {
        fail("Your browser does not support the WebGL extension OES_texture_float");
    }

    if (!gl.getExtension("WEBGL_color_buffer_float")) {
        fail("Your browser does not support the WebGL extension WEBGL_color_buffer_float");
    }

    var max_texture_size = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (max_texture_size < 512) {
        fail("Your browser only supports "+max_texture_size+"×"+max_texture_size+" WebGL textures");
    }

    // var ext = gl.getExtension('OES_texture_half_float')
    // window.HALF_FLOAT = ext.HALF_FLOAT_OES
}

function fail(message) {
    var fail = document.createElement("h1");
    // console.log(message)
    // var fail = document.createElement("h1");
    fail.id = "fail";
    fail.appendChild(document.createTextNode('Not supported on this browser. Please use desktop Chrome or Firefox'));
    // fail.appendChild(document.createTextNode(message));
    document.body.removeChild(document.getElementById("canvas"));
    document.body.appendChild(fail);
    throw message;
}