import REGL from 'regl'
import { loadImage, lerp, hexToHSV, rgbToHSV, hsv2hex, hsvObjToHex, hexToRgb } from './utils'
import { clearCircleFn, clearRectFn, initFn, transitionFn, computeFn, drawFn } from './shaders'
import * as dat from 'dat.gui';

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
    // let stepsPerFrame = 5

    const urlParamsRaw = new URLSearchParams(window.location.search);
    const urlParams = Object.fromEntries(urlParamsRaw.entries())

    const palette = {
        chem1A: '#A642F4',
        chem1B: '#F9E1E9',
        chem2A: "#f2f2f2",//{ h: 341 / 360, s: .0, v: .95 },
        chem2B: "#f2306d",// { h: 341 / 360, s: .8, v: .95 },
        backgroundA: '#E2C2FE',
        backgroundB: '#F9E1E9',
        colorMin: .15,
        colorMax: .3,
    };
    const computeParams = {
        F: 0.037,
        K: 0.06,
        scaleA: 1.05,
        scaleB: .85,
        diffusionScale: 1.0,

        noiseSpeed: .01,
        noiseStrength: .0,
        noiseDensity: 4,
        stepsPerFrame: 2,
    }
    // for solid colors do {f: .036, k: .053}
    const initializeParams = {
        probabilityA: .25,
        probabilityB: .25,
        loadMask: function () {
            document.getElementById('myInput').click()
        }
    }


    for (const obj of [palette, computeParams, initializeParams]) {
        for (let [k, v] of Object.entries(obj)) {
            if (urlParams[k] && typeof obj[k] == 'number') {
                urlParams[k] = parseFloat(urlParams[k])
            } 
            obj[k] = urlParams[k] ?? v
        }
    }

    
    function updateParams() {
        const queryParams = new URLSearchParams({
            ...palette,
            ...computeParams,
            probabilityA: initializeParams.probabilityA,
            probabilityB: initializeParams.probabilityB,
        }).toString()
        if (window.history.pushState) { 
            const newURL = new URL(window.location.href)
            newURL.search = '?' + queryParams;
            window.history.replaceState({ path: newURL.href }, '', newURL.href);
        }
    }

    if (Array.from(urlParamsRaw).length) {
        const gui = new dat.GUI()
        const folder1 = gui.addFolder('Colors');

        for (const name of Object.keys(palette)) {
            if (typeof palette[name] == 'string') {
                folder1.addColor(palette, name).onChange(updateParams)
            } else {
                folder1.add(palette, name, .0, 0.5).onChange(updateParams)
            }
        }

        const folder2 = gui.addFolder('ReactionDiffusion');
        folder2.add(computeParams, 'F', .01, .06).onChange(updateParams)
        folder2.add(computeParams, 'K', .01, .2).onChange(updateParams)
        folder2.add(computeParams, 'scaleA', .2, 2).onChange(updateParams)
        folder2.add(computeParams, 'scaleB', .2, 2).onChange(updateParams)
        folder2.add(computeParams, 'diffusionScale', .3, 2).onChange(updateParams)
        folder2.add(computeParams, 'noiseSpeed', .0, .01).onChange(updateParams)
        folder2.add(computeParams, 'noiseStrength', .0, .05).onChange(updateParams)
        folder2.add(computeParams, 'noiseDensity', .2, 20).onChange(updateParams)
        folder2.add(computeParams, 'stepsPerFrame', 1, 6, 1).onChange(updateParams)

        const folder3 = gui.addFolder('Initialization');

        folder3.add(initializeParams, 'probabilityA', .1, .5).onChange(updateParams)
        folder3.add(initializeParams, 'probabilityB', .1, .5).onChange(updateParams)

        folder3.add(initializeParams, 'loadMask').name('Load Mask file');
        gui.domElement.parentElement.style.zIndex = 99
        const obj = { Restart: function () { restart() } };
        gui.add(obj, 'Restart');
    }
    // const PURPLE = [128/255, 66/255, 244/255, 1.0]
    const PURPLE = hexToHSV('A642F4')
    const WHITE_HSV = [341 / 360, .0, .95]
    const RED_HSV = [341 / 360, .80, .95]
    // const RED = [214/255, 44/255, 98/255, 1.0]
    // const BLUE = [0, 0.0, .9, 1.0]
    // const GRAY = [.85, .85, .85, 1.0]
    // const state_colors = [
    //     [PURPLE, WHITE_HSV, hexToHSV('E2C2FE')],
    //     [hexToHSV('F9E1E9'), RED_HSV, hexToHSV('F9E1E9')],
    // ]
    let colorA, colorB, background

    const container = document.getElementById('container')

    const clear_circle = clearCircleFn(regl)
    const initialize = initFn(regl)
    const compute = computeFn(regl)
    const draw = drawFn(regl)

    const images = await Promise.all([loadImage('imgs/M.png')])
    const landscape_textures = images.map(regl.texture)
    let textures = landscape_textures

    document.getElementById('myInput').addEventListener("change", function () {
        const files = document.getElementById('myInput').files[0]
        if (files) {
            const fileReader = new FileReader();
            fileReader.readAsDataURL(files);
            fileReader.addEventListener("load", async function () {
                const image = await loadImage(this.result)
                textures = [regl.texture(image)]
            })
        }
    })
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
        initialize({
            duv, suv,
            dst: states[0],
            texture: textures[0],
            ...initializeParams
        });
        update_scroll()
    }

    function lerpHSV(a, b, v) {
        return {
            h: (1 - v) * a.h + v * b.h,
            s: (1 - v) * a.s + v * b.s,
            v: (1 - v) * a.v + v * b.v
        }
    }
    function hsvArray({ h, s, v }) {
        return [h / 1, s, v]
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

        colorA = lerp(hexToHSV(palette.chem1A), hexToHSV(palette.chem1B), v)
        colorB = rgbToHSV(lerp(hexToRgb(palette.chem2A), hexToRgb(palette.chem2B), v))
        // colorB = hsvArray(lerpHSV(palette.chem2A, palette.chem2B, v))
        background = lerp(hexToHSV(palette.backgroundA), hexToHSV(palette.backgroundB), v)

        colorA = [...colorA, 1]
        colorB = [...colorB, 1]
        background = [...background, 1]
        // console.log(hexToHSV(palette.backgroundA), background);
        // colorA = lerp(state_colors[sidx][0], state_colors[sidx + 1][0], v)
        // background = lerp(state_colors[sidx][2], state_colors[sidx + 1][2], v)
        // console.log(lerpHSV(palette.color1, palette.color2, v));
    }
    let mouse = [-1, -1]
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
        for (let i = 0; i < computeParams.stepsPerFrame; i++) {
            compute({ src: states[0], dst: states[1], mouse: [-1, -1], ...computeParams })
            compute({ src: states[1], dst: states[0], mouse: [-1, -1], ...computeParams })
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
        draw({
            colorA, colorB, background, 
            colorMin: palette.colorMin,
            colorMax: palette.colorMax,
            src: states[0]
        })
    })
    window.addEventListener('resize', restart)
    restart()
}