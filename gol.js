console.log('?')
const loadImage = require('./lib/image-promise.js')
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

const regl = require('./lib/regl.min.js')({
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
    // onDone: main
});
main(regl)

function main(regl) {
    let w;
    let h;
    let scale = 1.0;
    let states = []
    let container = document.getElementById('container')
    let test = document.getElementById('test')

    let p_respawn = .02
    let p_cull = .000//1

    const initialize = require('./shaders/gol/initialize.js')(regl)
    const compute = require('./shaders/gol/compute.js')(regl)
    const draw = require('./shaders/gol/draw.js')(regl)

    console.time('load_images')
    Promise.all([
        Promise.all([
            loadImage('imgs/title.png'),
            loadImage('imgs/gen_design.png')
        ]),
        Promise.all([
            loadImage('imgs/gol/title_sq.png'),
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
            // [red, red],
            [[.98, .98, .98, 1.0], purple],
            [[0, 0.0, .9, 1.0], [.92, .92, .92, 1.0]],
            [red, red]
        ]

        let colorA = state_colors[0][0]
        let colorB = state_colors[0][1]

        let rect = new Float32Array(4);
        let rectBuf = regl.buffer(rect);

        function scroll_index() {
            const step = container.scrollHeight / images.length
            const y = container.scrollTop
            const idx = Math.max(0, Math.min(Math.floor(y / step), images.length -1))
            const percent = (y - idx*step) / step
            return [ idx, percent ]
        }

        let [ scroll_idx, scroll_percent ] = scroll_index()
        let last_scroll_idx = scroll_idx

        const random = regl.texture({
            width: 512,
            height: 512,
            data: random_list(512*512*4)
        })

        function restart() {
            console.log('restart')
            w = Math.floor(regl._gl.canvas.width * scale);
            h = Math.floor(regl._gl.canvas.height * scale);
            textures = (w / h) > 1.8  ? landscape_textures : portrait_textures

            states = [0, 1].map(i => (states[i] || regl.framebuffer)({
                colorType: regl.hasExtension('oes_texture_half_float') ? 'half float' : 'float',
                width: w,
                height: h,
            }));

            initialize({ dst: states[0], texture: textures[0], random });
        }

        restart()
        window.addEventListener('resize', restart)
        let i = 0
        let last_scroll = 0
        regl.frame(({tick, time}) => {
            if (i++ == 2) {
                let derp = p_cull
                if (container.scrollTop != last_scroll) {
                    derp = .1
                }
                last_scroll = container.scrollTop
                let offsety = .02 *container.scrollTop / window.innerHeight
                const bounds = test.getBoundingClientRect()
                const rect = [
                    bounds.left / window.innerWidth,
                    bounds.top / window.innerHeight,
                    bounds.right / window.innerWidth,
                    bounds.bottom / window.innerHeight
                ]
                const data = { p_respawn, p_cull:derp, offsety, rect }
                compute({ src: states[0], dst: states[1], random:Math.random(), ...data })
                compute({ src: states[1], dst: states[0], random:Math.random(), ...data })
                draw({ colorA, colorB, srcA: states[1], srcB: states[0], interp: (0) })
                i = 0
            }


        })
    })
}