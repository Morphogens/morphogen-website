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

    let container = document.getElementById('container')
    let test = document.getElementById('test')
    let controlRoot = document.createElement('div');

    const clear_rect = require('./shaders/clear_rect.js')(regl)
    const initialize = require('./shaders/initialize.js')(regl)
    const transition = require('./shaders/transition.js')(regl)
    const compute = require('./shaders/compute.js')(regl)
    const draw = require('./shaders/draw.js')(regl)

    Promise.all([
        loadImage('imgs/title.png'),
        loadImage('imgs/gen_design.png')
    ]).then( images => {

        const textures = images.map(regl.texture)

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
            const random = regl.texture({
              width: 512,
              height: 256,
              data: random_list(512*256*4)
            })
            initialize({ dst: states[0], texture: textures[0], random});
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
                    bounds.left / window.innerWidth, bounds.top / window.innerHeight,
                    bounds.right / window.innerWidth, bounds.bottom / window.innerHeight
                ]
            });
            draw({src: states[0]});
        })
    })
}