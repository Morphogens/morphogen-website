function write_texture(gl, texture, array) {
    gl.bindTexture(gl.TEXTURE_2D, texture)
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
    if (!gl) fail("WebGL is not supported");

    var float_texture_ext = gl.getExtension("OES_texture_float");
    if (!float_texture_ext) fail("Your browser does not support the WebGL extension OES_texture_float");
    window.float_texture_ext = float_texture_ext; // Hold onto it

    var max_texture_size = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (max_texture_size < 512) fail("Your browser only supports "+max_texture_size+"×"+max_texture_size+" WebGL textures");
}

function fail(message) {
    var fail = document.createElement("p");
    fail.id = "fail";
    fail.appendChild(document.createTextNode(message));
    document.body.removeChild(document.getElementById("canvas"));
    document.body.appendChild(fail);
    throw message;
}