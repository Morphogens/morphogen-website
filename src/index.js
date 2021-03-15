import REGL from 'regl'
import { loadImage, lerp, hexToRgb } from './utils'
import { clearRectFn, initFn, transitionFn, computeFn, drawFn } from './shaders'

REGL({
    pixelRatio: 1.0,
    extensions: [ 'oes_texture_float' ],
    optionalExtensions: [ 'oes_texture_half_float' ],
    attributes: { antialias: false },
    onDone: main
})

async function main(_, regl) {
    let w;
    let h;
    let scale = 1.0;
    let states = []
    let itersPerFrame = 5
    const GRAY = [.85, .85, .85, 1.0]
    // const PURPLE = [128/255, 66/255, 244/255, 1.0]
    const PURPLE = hexToRgb('A642F4')
    // const RED = [214/255, 44/255, 98/255, 1.0]
    // const BLUE = [0, 0.0, .9, 1.0]
    const WHITE = [.95, .95, .95, 1.0]
    const state_colors = [
        [ PURPLE, WHITE, hexToRgb('E2C2FE')],
        [ hexToRgb('F9E1E9'), hexToRgb('D62C62'), hexToRgb('FCF0F4')],
        [ hexToRgb('D62C62'), hexToRgb('D62C62'), hexToRgb('FCF0F4')],
    ]
    let [colorA, colorB, background] = state_colors[0]

    let container = document.getElementById('container')
    let info_container = document.getElementById('info-container')
    const clear_rect = clearRectFn(regl)
    const initialize = initFn(regl)
    const transition = transitionFn(regl)
    const compute = computeFn(regl)
    const draw = drawFn(regl)

    console.time('load_images')
    const images = await Promise.all([
        loadImage('imgs/M.png'),
    ])
    console.timeEnd('load_images')
    // const portrait_textures = mobile_images.map(regl.texture)
    const landscape_textures = images.map(regl.texture)
    let textures = landscape_textures

    let [ sidx, scroll_percent ] = scroll_index()
    let last_sidx = sidx

    function scroll_index() {
        const step = container.scrollHeight / images.length
        const y = container.scrollTop
        const idx = Math.max(0, Math.min(Math.floor(y / step), images.length -1))
        const percent = (y - idx*step) / step
        return [ idx, percent ]
    }

    function restart() {
        console.log('restart')
        w = 2 * Math.round(regl._gl.canvas.width * scale / 2);
        h = 2 * Math.round(regl._gl.canvas.height * scale / 2);
        // textures = w > 1200 ? landscape_textures : portrait_textures
        states = [0, 1].map(i => (states[i] || regl.framebuffer)({
            colorType: regl.hasExtension('oes_texture_half_float') ? 'half float' : 'float',
            width: w,
            height: h,
            depthStencil: false
        }))
        let duv = [0, -0.0]
        let suv = [1, 1.]
        if (w > h) {
            let d = w - h
            let s = d / w
            suv[0] = 1/(1-s)
            duv[0] = - s/2
        } else {
            let d = h - w
            let s = d / h
            suv[1] = 1/(1-s)
            duv[1] = - s/2
        }
        initialize({ duv, suv, dst: states[0], texture: textures[0] });
        update_scroll()
    }

    function update_scroll() {
        [sidx, scroll_percent] = scroll_index()
        if (sidx != last_sidx) {
            console.log('transition', last_sidx, sidx)
            transition({
                src: states[1],
                dst: states[0],
                old_texture: textures[last_sidx],
                new_texture: textures[sidx],
            })
            last_sidx = sidx
        }
        let v
        if (sidx == 0) {
            v = scroll_percent
        }
        if (scroll_percent < 0.25) {
            v = 0
        } else if (scroll_percent > 0.75) {
            v = 1.0
        } else {
            v = (scroll_percent-0.25) * 2.0
        }
        colorA = lerp(state_colors[sidx][0], state_colors[sidx+1][0], v)
        colorB = lerp(state_colors[sidx][1], state_colors[sidx+1][1], v)
        background = lerp(state_colors[sidx][2], state_colors[sidx+1][2], v)
    }

    regl.frame(({ tick, time }) => {
        update_scroll()
        for (let i = 0; i < itersPerFrame; i++) {
            compute({ src: states[0], dst: states[1] })
            compute({ src: states[1], dst: states[0] })
        }
        const bounds = info_container.getBoundingClientRect()
        clear_rect({
            dst: states[0],
            rect: [
                bounds.left / window.innerWidth,
                bounds.top / window.innerHeight,
                bounds.right / window.innerWidth,
                bounds.bottom / window.innerHeight
            ]
        })
        draw({ colorA, colorB, background, src: states[0] })
    })
    window.addEventListener('resize', restart)
    restart()
}