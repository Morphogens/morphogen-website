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
    pixelRatio: 0.9,
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

    Promise.all([
        loadImage('imgs/title_mobile.png'),
        loadImage('imgs/gen_design.png')
    ]).then( images => {

        const textures = images.map(regl.texture)
        const purple = [128/255, 66/255, 244/255, 1.0]
        const red = [214/255, 44/255, 98/255, 1.0]

        const state_colors = [

            [[.95, .95, .95, 1.0], purple],
            [[0, 0.0, .9, 1.0], [.95, .95, .95, 1.0]],
            // [purple, purple],
            [red, red]
        ]

        function interpolate(a, b, v) {
            return [
                (1-v)*a[0]+ v*b[0],
                (1-v)*a[1]+ v*b[1],
                (1-v)*a[2]+ v*b[2],
                (1-v)*a[3]+ v*b[3]
            ]
        }
        // console.log('onload')

        let colorA = state_colors[0][0]
        let colorB = state_colors[0][1]

        let rect = new Float32Array(4);
        let rectBuf = regl.buffer(rect);

        function scroll_index() {
            const step = container.scrollHeight / images.length
            // const step = window.innerHeight * 2
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
        }

        container.addEventListener('scroll', (event) => {
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
            console.log({scroll_percent, foo})
            // const p = Math.max(0.0, (1.0- 1.6 * scroll_percent))
            colorA = interpolate(state_colors[scroll_idx][0], state_colors[scroll_idx+1][0], foo)
            colorB = interpolate(state_colors[scroll_idx][1], state_colors[scroll_idx+1][1], foo)
            // console.log(scroll_percent, colorA)
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