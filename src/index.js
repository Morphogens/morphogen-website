import REGL from 'regl'
import { loadImage, lerp, hexToHSV, rgbToHSV, hsv2hex } from './utils'
import { clearCircleFn, clearRectFn, initFn, transitionFn, computeFn, drawFn } from './shaders'

REGL({
    pixelRatio: 1.0,
    extensions: ['oes_texture_float'],
    optionalExtensions: ['oes_texture_half_float'],
    attributes: { antialias: false },
    onDone: main
})

async function main(_, regl) {
    let w;
    let h;
    let scale = 1.0;
    let states = []
    let itersPerFrame = 5
    // const PURPLE = [128/255, 66/255, 244/255, 1.0]
    const PURPLE = hexToHSV('A642F4')
    // const WHITE = rgbToHSV([.95, .95, .95, 1.0])
    const WHITE_HSV = [341/360, .0, .95, 1.0]
    const RED_HSV = [341/360, .80, .95, 1.0]

    // const RED = [214/255, 44/255, 98/255, 1.0]
    // const BLUE = [0, 0.0, .9, 1.0]
    // const GRAY = [.85, .85, .85, 1.0]
    const state_colors = [
        [PURPLE, WHITE_HSV, hexToHSV('E2C2FE')],
        // [PURPLE, WHITE_HSV, hexToHSV('E2C2FE')],
        [hexToHSV('F9E1E9'), RED_HSV, hexToHSV('F9E1E9')],
        // [PURPLE, WHITE, hexToHSV('E2C2FE')],
        // [hexToHSV('F9E1E9'), hexToHSV('D62C62'), hexToHSV('F9E1E9')],
        // [hexToHSV('D62C62'), hexToHSV('D62C62'), hexToHSV('F9E1E9')],
    ]
    console.log(state_colors);
    let [colorA, colorB, background] = state_colors[0]

    const container = document.getElementById('container')

    // const scrollContent = document.querySelectorAll('.scroll-content')
    // let info_container = document.getElementById('info-container')

    // const clear_rect = clearRectFn(regl)
    const clear_circle = clearCircleFn(regl)
    // const transition = transitionFn(regl)
    const initialize = initFn(regl)
    const compute = computeFn(regl)
    const draw = drawFn(regl)

    // console.time('load_images')
    const images = await Promise.all([ loadImage('imgs/M.png') ])
    // console.timeEnd('load_images')
    // const portrait_textures = mobile_images.map(regl.texture)
    const landscape_textures = images.map(regl.texture)
    let textures = landscape_textures

    // const [ start_sidx, start_scroll_percent ] = scroll_index()
    // console.log(start_sidx);
    // let last_sidx = start_sidx
    // let lastScroll = start_scroll_percent

    function getScrollPercent() {
        return container.scrollTop / (container.scrollHeight - container.offsetHeight)
    }

    // function scroll_index() {
    //     const step = container.scrollHeight / images.length
    //     const y = container.scrollTop
    //     const idx = Math.max(0, Math.min(Math.floor(y / step), images.length -1))
    //     // const percent = (y - idx*step) / step
    //     // console.log(0, getScrollPercent());
    //     // return [ idx, percent ]
    //     return [0, getScrollPercent()]
    // }

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
            suv[0] = 1 / (1 - s)
            duv[0] = - s / 2
        } else {
            let d = h - w
            let s = d / h
            suv[1] = 1 / (1 - s)
            duv[1] = - s / 2
        }
        initialize({ duv, suv, dst: states[0], texture: textures[0] });
        update_scroll()
    }

    function update_scroll() {
        // const [sidx, scroll_percent] = scroll_index()
        // if (sidx != last_sidx) {
        //     console.log('transition', last_sidx, sidx)
        //     transition({
        //         src: states[1],
        //         dst: states[0],
        //         old_texture: textures[last_sidx],
        //         new_texture: textures[sidx],
        //     })
        //     last_sidx = sidx
        // }
        // let v = scroll_percent
        const sidx = 0
        const v = getScrollPercent()
        colorA = lerp(state_colors[sidx][0], state_colors[sidx + 1][0], v)
        colorB = lerp(state_colors[sidx][1], state_colors[sidx + 1][1], v)
        background = lerp(state_colors[sidx][2], state_colors[sidx + 1][2], v)
    }
    let mouse = null
    let mouseDown = false
    document.addEventListener('mousemove', (event) => {
        mouse = [event.clientX / window.innerWidth, event.clientY / window.innerHeight]
    })
    document.addEventListener('touchmove', (event) => {
        var touch = e.originalEvent.touches[0] || e.originalEvent.changedTouches[0];
        x = touch.pageX;
        y = touch.pageY;
        mouse = [x / window.innerWidth, y / window.innerHeight]
    })
    document.addEventListener('touchstart', (event) => {
        mouseDown = true
    })
    document.addEventListener('touchend', (event) => {
        mouseDown = false
    })
    document.addEventListener('mousedown', (event) => {
        mouseDown = true
    })
    document.addEventListener('mouseup', (event) => {
        mouseDown = false
    })
    regl.frame(({ tick, time }) => {
        update_scroll()
        for (let i = 0; i < itersPerFrame; i++) {
            compute({ src: states[0], dst: states[1] })
            compute({ src: states[1], dst: states[0] })
        }
        if (mouse && mouseDown) {
            clear_circle({ 
                position: mouse,
                fillIndex: 0,
                dst: states[0],
                radius: .03
            })
        }
        // if (scroll_percent != lastScroll) {
        //     scrollContent.forEach((dom, index) => {
        //     // for (const dom of scrollContent) {
        //         const bounds = dom.getBoundingClientRect()
        //         clear_rect({
        //             fillIndex: (index % 2), 
        //             dst: states[0],
        //             rect: [
        //                 bounds.left / window.innerWidth,
        //                 bounds.top / window.innerHeight,
        //                 bounds.right / window.innerWidth,
        //                 bounds.bottom / window.innerHeight
        //             ]
        //         })
        //     })
        // }
        draw({ colorA, colorB, background, src: states[0] })
        // console.log(colorB, hsv2hex(colorB));
        // document.body.style.background = hsv2hex(colorB)
    })
    window.addEventListener('resize', restart)
    restart()
}