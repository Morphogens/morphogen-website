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

require('regl')({
    pixelRatio: 0.75,
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

    let state = {
        relDiffusion: 2.0,
        f: 0.037,
        hue: 0,
        k: 0.06,
    };

    let container = document.getElementById('container')
    let test = document.getElementById('test')
    let controlRoot = document.createElement('div');


    let img_header = new Image()
    img_header.src = 'title.png'

    Promise.all([
        loadImage('imgs/title.png'),
        loadImage('imgs/gen_design.png')
    ]).then( images => {
        console.log('onload')

        let rect = new Float32Array(4);
        let rectBuf = regl.buffer(rect);


        function scroll_index() {
            const y = container.scrollTop
            return Math.floor(y / 600) % images.length;
        }

        let scroll_idx = scroll_index()
        let last_scroll_idx = scroll_idx


        function restart() {
            console.log('restart')
            w = Math.floor(regl._gl.canvas.width * scale);
            h = Math.floor(regl._gl.canvas.height * scale);
            states = [0, 1].map(i => (states[i] || regl.framebuffer)({
                colorType: regl.hasExtension('oes_texture_half_float') ? 'half float' : 'float',
                width: w,
                height: h,
            }));
            initialize({dst: states[0]});
        }

        container.addEventListener('scroll', (event) => {
            scroll_idx = scroll_index()
            if (scroll_idx != last_scroll_idx) {
                console.log('transition', last_scroll_idx, scroll_idx)
                transition({
                    src: states[1],
                    dst: states[0],
                    old_texture: regl.texture(images[last_scroll_idx]),
                    new_texture: regl.texture(images[scroll_idx]),
                    random: regl.texture({
                        width: 512, height: 256, data: random_list(512*256*4)
                    })
                })
                last_scroll_idx = scroll_idx
            }
        })

        require('mouse-change')(regl._gl.canvas, (buttons, x, y, mods) => {
            if (buttons) {
                xy[0] = x / regl._gl.canvas.clientWidth * 2.0 - 1.0;
                xy[1] = (1.0 - y / regl._gl.canvas.clientHeight) * 2.0 - 1.0;
                console.log('clear')
                clear_rect({dst: states[0]});
            }
        });

        var clear_rect = regl({
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
                rect: () => {
                    const bounds = test.getBoundingClientRect()
                    return [
                        bounds.left / window.innerWidth,
                        bounds.top / window.innerHeight,
                        bounds.right / window.innerWidth,
                        bounds.bottom / window.innerHeight,
                    ]
                }
            },
            framebuffer: regl.prop('dst'),
            depth: {enable: false},
            count: 3,
        });

        var initialize = regl({
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

                    gl_FragColor = vec4(1.0, 0, 1.0, 0);

                    if (val.g > 0.9 && texture2D(random, uv).g >= 0.9) {
                        gl_FragColor.x = 1.0;
                         // + rand(uv, 2.0)*.02 - 0.1;
                        gl_FragColor.y = 0.25;
                        // + rand(uv, 3.0)*.02 - 0.1;
                    }
                    if (val.r > 0.5 && texture2D(random, uv).r > 0.2) {
                        gl_FragColor.z = 0.5;
                         // + rand(uv, 4.0)*.02 - 0.1;
                        gl_FragColor.w = 0.25;
                         // + rand(uv, time+5.0)*.02 - 0.1;
                    }
                }
            `,
            attributes: {xy: [-4, -4, 0, 4, 4, -4]},
            uniforms: {
                texture: regl.texture(images[0]),
                random: regl.texture({
                  width: 512,
                  height: 256,
                  data: random_list(512*256*4)
                })
            },
            framebuffer: regl.prop('dst'),
            depth: {enable: false},
            count: 3,

        });

        var transition = regl({
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
                    bool new_bound = texture2D(new_texture, uv).r < 0.2;

                    bool old_seed = texture2D(old_texture, uv).g > 0.2;
                    bool old_bound = texture2D(old_texture, uv).r < 0.2;

                    vec4 result = oldv;

                    vec4 rand = texture2D(random, uv);

                    if (new_bound) {
                        /* Clear morph2 to allow morph1 to grow. */
                        result.zw = vec2(1.0, 0.0);
                    }

                    if (new_seed) {
                        if (rand.x > 0.9) {
                            result.xy = vec2(0.5, 0.25);
                        } else {
                            result.xy = vec2(1.0, 0.0);
                        }
                    }

                    if (old_text) {
                        result.xy = vec2(1.0, 0.0);
                    }

                    if (old_seed && !new_bound) {
                        if (rand.y > 0.9) {
                            result.zw = vec2(0.5 + (rand.z * .02) - .01, 0.25+(rand.x*.02) - .01);
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
                random: regl.texture({
                    width: 512, height: 256, data: random_list(512*256*4)
                })
            },
            framebuffer: regl.prop('dst'),
            depth: {enable: false},
            count: 3,

        });


        var compute = regl({
            vert: `
                precision mediump float;
                attribute vec2 xy;
                varying vec2 vUv;
                void main () {
                    vUv = xy * 0.5 + 0.5;
                    gl_Position = vec4(xy, 0, 1);
                }
            `,
            frag: glsl`
                precision mediump float;
                uniform sampler2D u_src;
                uniform vec2 u_size;
                uniform float scale;
                varying vec2 vUv;
                const float F = 0.04, K = 0.06;
                float D_a = 0.2*scale, D_b = 0.1*scale;

                void main() {
                    vec2 p = vUv,
                         n = p + vec2(0.0, 1.0)*u_size,
                         e = p + vec2(1.0, 0.0)*u_size,
                         s = p + vec2(0.0, -1.0)*u_size,
                         w = p + vec2(-1.0, 0.0)*u_size;

                    vec4 val = texture2D(u_src, p);

                    vec4 lap = texture2D(u_src, n)
                        + texture2D(u_src, e)
                        + texture2D(u_src, s)
                        + texture2D(u_src, w)
                        - 4.0 * val;

                    val += vec4(D_a * lap.x - val.x*val.y*val.y + F * (1.0-val.x),
                                D_b * lap.y + val.x*val.y*val.y - (K+F) * val.y,
                                D_a * lap.z - val.z*val.w*val.w + F * (1.0-val.z),
                                D_b * lap.w + val.z*val.w*val.w - (K+F) * val.w);

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
                uRule: [
                    state.relDiffusion,
                    state.f,
                    state.k
                ],
                scale: 0.3,
                u_src: regl.prop('src'),
                u_size: ctx => [1 / ctx.framebufferWidth, 1 / ctx.framebufferHeight],
            },
            framebuffer: regl.prop('dst'),
            depth: { enable: false },
            count: 3
        });

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


        var drawToScreen = regl({
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
                // uniform vec2 u_size;
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
                colorA: hexToRgb("#0000e0"),
                colorB: hexToRgb("#e3e3ff"),
                src: regl.prop('src'),
                show: 3,
            },
            attributes: {xy: [-4, -4, 0, 4, 4, -4]},
            depth: {enable: false},
            count: 3
        });

        restart()


        window.addEventListener('resize', restart)
        let itersPerFrame = 10
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
            clear_rect({dst: states[0]});
            drawToScreen({src: states[0]});
        });
    })
}