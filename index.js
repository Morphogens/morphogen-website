var W = window.innerWidth
var H = window.innerHeight
var canvas

function arr_sum(arr) {
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
    /* Create an array of the size of the canavs.
       The image is centered and fills the canvas with white padding.
    */
    const aspect_image  = image.width / image.height
    const aspect_canvas = W / H

    ctx_tmp.globalAlpha = 1.0;
    ctx_tmp.fillStyle = "white"
    ctx_tmp.fillRect(0, 0, W, H)
    ctx_tmp.fillRect(0, -H, W, H)

    // ctx_tmp.scale(1, -1)
    if (aspect_image < aspect_canvas) { // The canvas is wider than the image
        let width = canvas.height * aspect_image
        let pad_left = (W - width) * 0.5
        ctx_tmp.drawImage(image, pad_left, -H, width, H)

    } else { // The canvas is taller than the image
        let height = canvas.width / aspect_image
        let pad_top = (H - height) * 0.5
        ctx_tmp.drawImage(image, 0, -height - pad_top, canvas.width, height)
    }
    // ctx_tmp.scale(1, 1)

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

// function resize() {
//   // Lookup the size the browser is displaying the canvas.
//   var displayWidth  = canvas.clientWidth;
//   var displayHeight = canvas.clientHeight;

//   // Check if the canvas is not the same size.
//   if (canvas.width  != displayWidth ||
//       canvas.height != displayHeight) {

//     // Make the canvas the same size
//     canvas.width  = displayWidth;
//     canvas.height = displayHeight;
//   }
// }

function scroll_index(){
    const y = document.getElementById('scroll_container').scrollTop
    return Math.min(2, Math.floor(y / 600));
}

function init() {
    canvas = document.getElementById("canvas");

    canvas.id = "canvas";
    canvas.width = W;
    canvas.height = H;
    document.body.appendChild(canvas);

    var gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    checkCompatibility(gl);

    var vertex_shader  = createShader(gl, gl.VERTEX_SHADER,   "vertex-shader"),
        compute_shader = createShader(gl, gl.FRAGMENT_SHADER, "compute-shader"),
        render_shader  = createShader(gl, gl.FRAGMENT_SHADER, "render-shader");

    var compute_prog = createAndLinkProgram(gl, vertex_shader, compute_shader),
        render_prog  = createAndLinkProgram(gl, vertex_shader, render_shader);


    var locations = {}
    var show_value = 3
    var scale_value = 0.30
    var reset = false
    var decay = false
    var colorA = "#0000e0"
    var colorB = "#e3e3ff"

    gl.useProgram(render_prog);
    loadVertexData(gl, render_prog);
    gl.uniform2f(gl.getUniformLocation(render_prog, "u_size"), W, H);
    locations.show_outside = gl.getUniformLocation(render_prog, "show")
    locations.colorA = gl.getUniformLocation(render_prog, "colorA")
    locations.colorB = gl.getUniformLocation(render_prog, "colorB")
    gl.uniform1i(locations.show_outside, show_value);

    gl.useProgram(compute_prog);
    loadVertexData(gl, compute_prog);
    gl.uniform2f(gl.getUniformLocation(compute_prog, "u_size"), W, H);
    locations.scale = gl.getUniformLocation(compute_prog, "scale")
    locations.time = gl.getUniformLocation(compute_prog, "time")
    locations.decay = gl.getUniformLocation(compute_prog, "decay")

    gl.uniform1f(locations.scale, scale_value);

    window.gui = new dat.GUI({
        height : 5 * 32 - 1
    });
    gui.closed  = true
    var params = {
        scale:scale_value,
        show_outside: !!(show_value & 1<<1),
        show_inside:  !!(show_value & 1),
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
    gui.domElement.parentElement.style.zIndex = 3

    let scroll_i = scroll_index()
    let last_scroll_i = scroll_i;

    var t, previousTime
    t = previousTime = performance.now()
    const time_samples = 100
    var time_count = 0
    var time_sum = 0

    Promise.all([
        load_image('img/thin.png'),
        load_image('img/fat.png'),
        load_image('img/thin2.png'),
        load_image('img/fat2.png'),
        load_image('img/thin5.png'),
        load_image('img/fat5.png'),
    ]).then(images => {
        let arrays = images.map(image_to_arr)
        let initial_state = make_random_state(arrays[2*scroll_i], arrays[2*scroll_i +1]);
        let t1 = newTexture(gl, initial_state),
            t2 = newTexture(gl, null),
            fb1 = newFramebuffer(gl, t1),
            fb2 = newFramebuffer(gl, t2);

        gl.useProgram(compute_prog);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb1);
        var fb_status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (fb_status != gl.FRAMEBUFFER_COMPLETE) {
            fail("Cannot render to framebuffer: " + fb_status);
        }

        function renderloop(timeStamp) {
            // Check for window resize.
            if (gl.canvas.width  != window.innerWidth ||
                gl.canvas.height != window.innerHeight) {

                // W = window.innerWidth
                // H = window.innerHeight
                // gl.canvas.width  = W;
                // gl.canvas.height = H;
                // arrays = images.map(image_to_arr)

                // console.log('resize', scroll_i)
                // gl.bindFramebuffer(gl.FRAMEBUFFER, fb1);
                // gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)

                // gl.bindFramebuffer(gl.FRAMEBUFFER, fb2);
                // gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
                window.location = '' // lolol lazy hack
                // initial_state = make_random_state(arrays[2*scroll_i], arrays[2*scroll_i +1])
                // t1 = newTexture(gl, initial_state),
                // t2 = newTexture(gl, null)
                // fb1 = newFramebuffer(gl, t1)
                // fb2 = newFramebuffer(gl, t2)
                // gl.useProgram(compute_prog)
                // gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
                // gl.useProgram(compute_prog);
                // // gl.clear(gl.COLOR_BUFFER_BIT);

                // t1 = newTexture(gl, initial_state),
                // t2 = newTexture(gl, null),
                // fb1 = newFramebuffer(gl, t1),
                // fb2 = newFramebuffer(gl, t2);


                // gl.bindFramebuffer(gl.FRAMEBUFFER, fb1);

                // write_texture(gl, t1, initial_state)
                // write_texture(gl, t2, initial_state)
                // gl.bindFramebuffer(gl.FRAMEBUFFER, fb1);

                // gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t1, 0)

                // gl.bindFramebuffer(gl.FRAMEBUFFER, fb2);
                // gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
                // gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t2, 0)
                // reset = true
            }
            if (reset) {
                console.log('reset')
                reset = false
                initial_state = make_random_state(arrays[2*scroll_i], arrays[2*scroll_i +1])
                write_texture(gl, t1, initial_state)
            }
            { // Do FPS stuff.
                t = performance.now();
                let elapsed = t - previousTime
                previousTime = t
                time_sum += elapsed
                time_count += 1

                if (time_count == time_samples) {
                    console.log(`FPS = ${1000 / (time_sum / time_samples)}`)
                    time_count = 0
                    time_sum = 0
                }
            }
            gl.useProgram(compute_prog);
            gl.uniform1f(locations.scale, scale_value);
            gl.uniform1f(locations.time, timeStamp);
            gl.uniform1i(locations.decay, decay);
            for (var i=0; i < 10; i++) {
                gl.bindTexture(gl.TEXTURE_2D, (i%2==0)?t1:t2);
                gl.bindFramebuffer(gl.FRAMEBUFFER, (i%2==0)?fb2:fb1);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }
            scroll_i = scroll_index()

            if (scroll_i != last_scroll_i) {
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t1, 0);
                let pixels = new Float32Array(W * H * 4)
                gl.readPixels(0, 0, W, H, gl.RGBA, gl.FLOAT, pixels)

                let [ last_thin, last_fat ] = [ arrays[2*last_scroll_i], arrays[2*last_scroll_i+1] ]
                let [ next_thin, next_fat ] = [ arrays[2*scroll_i], arrays[2*scroll_i+1] ]
                write_texture(gl, t1, create_transition(pixels, last_thin, last_fat, next_thin, next_fat))
                last_scroll_i = scroll_i
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
            if (Math.random() > 0.7) {
                result[4*i + 0] = 0.5 + Math.random() * 0.2 - 0.01
                result[4*i + 1] = 0.25 + Math.random() * 0.2 - 0.01
            } else {
                result[4*i + 0] = 1
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
            if (Math.random() > 0.7) {
                result[4*i + 2] = 0.5 + Math.random() * 0.2 - 0.01
                result[4*i + 3] = 0.25 + Math.random() * 0.2 - 0.01
            } else {
                result[4*i + 2] = 1
                result[4*i + 3] = 0
            }
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



init();