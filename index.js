var W = 1024, H = 512;
var canvas;

function arr_sum (arr) {
    return arr.reduce((a, b) => a+b)
}

function load_image(src) {
    let image = new Image();
    image.src = src
    return new Promise((resolve, reject) => {
        image.onload = () => resolve(image)
    })
}


let canvas_tmp = document.createElement('canvas')
canvas_tmp.width = W
canvas_tmp.height = H
let ctx_tmp = canvas_tmp.getContext('2d')
ctx_tmp.scale(1, -1)
function image_to_arr(image) {
    ctx_tmp.clearRect(0, 0, W, H)
    ctx_tmp.drawImage(image, 0, -H, W, H)
    return ctx_tmp.getImageData(0, 0, W, H).data
}


function load_image_array(src) {
    return load_image(src).then(image => {
        return image_to_arr(image)
    })
}

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

function init() {
    // window.scrollY = 0
    canvas = document.getElementById("canvas");

    canvas.id = "canvas";
    canvas.width = W;
    canvas.height = H;
    document.body.appendChild(canvas);

    var gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    checkCompatibility(gl);

    var vertex_shader   = createShader(gl, gl.VERTEX_SHADER,   "vertex-shader"),
        timestep_shader = createShader(gl, gl.FRAGMENT_SHADER, "timestep-shader"),
        render_shader   = createShader(gl, gl.FRAGMENT_SHADER, "render-shader");

    var timestep_prog = createAndLinkProgram(gl, vertex_shader, timestep_shader),
        render_prog = createAndLinkProgram(gl, vertex_shader, render_shader);


    var locations = {}
    var show_value = 3
    var scale_value = 0.36
    var reset = false
    var decay = false
    var colorA = "#0000e8"
    var colorB = "#e3e3ff"


    gl.useProgram(render_prog);
    loadVertexData(gl, render_prog);
    gl.uniform2f(gl.getUniformLocation(render_prog, "u_size"), W, H);
    locations.show_outside = gl.getUniformLocation(render_prog, "show")
    locations.colorA = gl.getUniformLocation(render_prog, "colorA")
    locations.colorB = gl.getUniformLocation(render_prog, "colorB")
    gl.uniform1i(locations.show_outside, show_value);

    gl.useProgram(timestep_prog);
    loadVertexData(gl, timestep_prog);
    gl.uniform2f(gl.getUniformLocation(timestep_prog, "u_size"), W, H);
    locations.scale = gl.getUniformLocation(timestep_prog, "scale")
    locations.time = gl.getUniformLocation(timestep_prog, "time")
    locations.decay = gl.getUniformLocation(timestep_prog, "decay")

    gl.uniform1f(locations.scale, scale_value);

    window.gui = new dat.GUI({
        height : 5 * 32 - 1
    });
    gui.closed  = true
    var params = {
        scale:scale_value,
        show_outside: true,
        show_inside: true,
        colorA: colorA,
        colorB: colorB,
        restart: () => { reset = true },
        decay: decay,
    };
    gui.add(params, 'scale', 0.3, 0.75).onChange((v) => {
        scale_value = v
        reset = true
    })
    gui.add(params, 'show_inside').onChange((v) => show_value ^= 1 )
    gui.add(params, 'show_outside').onChange((v) => show_value ^= 2 )
    gui.addColor(params, 'colorA').onChange((v) => colorA = v )
    gui.addColor(params, 'colorB').onChange((v) => colorB = v )
    gui.add(params, 'decay').onChange((v) => decay = v )
    gui.add(params, 'restart')

    let scroll_state = Math.floor(window.scrollY / 1000)
    var t, previousTime
    t = previousTime = performance.now()
    const time_samples = 100
    var time_count = 0
    var time_sum = 0

    Promise.all([
        load_image_array('thin.png'),
        load_image_array('fat.png'),
        load_image_array('thin2.png'),
        load_image_array('fat2.png'),
        load_image_array('thin4.png'),
        load_image_array('fat4.png'),
    ]).then(([ img_thin, img_fat, img_thin2, img_fat2, img_thin3, img_fat3 ]) => {
        let initial_state = make_random_state(img_thin, img_fat);

        var t1 = newTexture(gl, initial_state),
            t2 = newTexture(gl, null),
            fb1 = newFramebuffer(gl, t1),
            fb2 = newFramebuffer(gl, t2);

        const mask_array = new Float32Array(4 * W * H)
        const mask_texture = newTexture(gl, mask_array)

        // Check the hardware can render to a float framebuffer
        // (https://developer.mozilla.org/en-US/docs/Web/WebGL/WebGL_best_practices)
        gl.useProgram(timestep_prog);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb1);
        var fb_status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (fb_status != gl.FRAMEBUFFER_COMPLETE) {
            fail("Cannot render to framebuffer: " + fb_status);
        }
        let current_state = [ img_thin, img_fat ]
        function renderloop(timeStamp) {
            if (reset) {
                reset = false
                initial_state = make_random_state(img_thin, img_fat)
                write_texture(gl, t1, initial_state)
            }

            t = performance.now();
            var elapsed = t - previousTime
            previousTime = t
            time_sum += elapsed
            time_count += 1

            if (time_count == time_samples) {
                console.log(`FPS = ${1000 / (time_sum / time_samples)}`)
                time_count = 0
                time_sum = 0
            }


            gl.useProgram(timestep_prog);
            gl.uniform1f(locations.scale, scale_value);
            gl.uniform1f(locations.time, timeStamp);
            gl.uniform1i(locations.decay, decay);

            for (var i=0; i<20; i++) {
                gl.bindTexture(gl.TEXTURE_2D, (i%2==0)?t1:t2);
                gl.bindFramebuffer(gl.FRAMEBUFFER, (i%2==0)?fb2:fb1);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }

            let new_scroll_state = Math.floor(window.scrollY / 600)
            new_scroll_state = Math.min(2, new_scroll_state)

            // console.log(new_scroll_state)

            if (scroll_state != new_scroll_state) {
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t1, 0);
                let pixels = new Float32Array(W * H * 4)
                gl.readPixels(0,0, W, H, gl.RGBA, gl.FLOAT, pixels)

                if (new_scroll_state == 0) {
                    write_texture(gl, t1, create_transition(pixels, current_state[0], current_state[1], img_thin, img_fat))
                    current_state = [ img_thin, img_fat ]
                } else if (new_scroll_state == 1) {
                    write_texture(gl, t1, create_transition(pixels, current_state[0], current_state[1], img_thin2, img_fat2))
                    current_state = [ img_thin2, img_fat2 ]
                } else if (new_scroll_state == 2) {
                    write_texture(gl, t1, create_transition(pixels, current_state[0], current_state[1], img_thin3, img_fat3))
                    current_state = [ img_thin3, img_fat3 ]
                }
                // window.switch_state = false
                scroll_state = new_scroll_state
            }

            gl.useProgram(render_prog);
            gl.uniform1i(locations.show_outside, show_value);
            gl.uniform4fv(locations.colorA, hexToRgb(colorA));
            gl.uniform4fv(locations.colorB, hexToRgb(colorB));

            gl.bindTexture(gl.TEXTURE_2D, t1);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            requestAnimationFrame(renderloop)
        }

        requestAnimationFrame(renderloop)
    })
}



function create_transition(last_state, arr_thin1, arr_fat1, arr_thin2, arr_fat2) {
    const result = new Float32Array(4*W*H)

    for (let i = 0; i < W*H; i++) {
        let old_text = last_state[4*i + 1] > 0.2
        let new_seed = arr_thin2[4*i] < 100
        let new_bound = arr_fat2[4*i] < 100

        if (new_bound) {
            /* Clear morph2 to allow morph1 to grow. */
            result[4*i + 2] = 1.0
            result[4*i + 3] = 0
        } else {
            /* The new text wont go here so leave as is. */
            result[4*i+2] = last_state[4*i+2]
            result[4*i+3] = last_state[4*i+3]
        }

        if (new_seed) {
            if (Math.random() > 0.1) {
                result[4*i + 0] = 0.5 + Math.random() * 0.2 - 0.01
                result[4*i + 1] = 0.25 + Math.random() * 0.2 - 0.01
            } else {
                result[4*i + 0] = 0
                result[4*i + 1] = 0
            }


        } else {
            result[4*i] = last_state[4*i]
            result[4*i+1] = last_state[4*i+1]
        }
        if (old_text) {
            result[4*i + 0] = 1
            result[4*i + 1] = 0
        }

        if (arr_thin1[4*i] < 100 && !new_bound) {
            result[4*i + 2] = 0.5 + Math.random() * 0.2 - 0.01
            result[4*i + 3] = 0.25 + Math.random() * 0.2 - 0.01
        }
    }
    return result
}

function make_random_state(arr_thin, arr_fat) {
    let a = new Float32Array(4 * W * H)

    for (let i = 0; i < W*H; i++) {
        if (arr_thin[i*4] < 100 && Math.random() > 0.9) {
            a[4*i + 0] = 0.5 + Math.random() * 0.2 - 0.01
            a[4*i + 1] = 0.25 + Math.random() * 0.2 - 0.01
        } else {
            a[4*i + 0] = 1.0;
            a[4*i + 1] = 0;
        }
        if ((arr_fat[i*4 + 0] > 100) && Math.random() > 0.9) {
            a[4*i + 2] = 0.5 + Math.random() * 0.2 - 0.01
            a[4*i + 3] = 0.25 + Math.random() * 0.2 - 0.01
        } else {
            a[4*i + 2] = 1.0;
            a[4*i + 3] = 0;
        }
    }

    return a
}

function write_texture(gl, texture, array) {
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.FLOAT, array)
}

// Create, initialise, and bind a new texture
function newTexture(gl, initial_state) {
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
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

init();