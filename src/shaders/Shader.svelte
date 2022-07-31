<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import Regl from "regl";
    import { hexToHSV } from "../utils";
    import makeDrawImage from './draw'
    import makeComputeFn from './compute'
    import makeInitFn from './initialize'
    // import { onDestroy } from "svelte/types/runtime/internal/lifecycle";

    let canvas: HTMLCanvasElement;
    let width
    let height

    const options = {
        colors: {
            chem1A: '#A642F4',
            // chem1A: '#d8b3f5',
            chem1B: '#F9E1E9',
            // chem2A: "#f2f2f2",//{ h: 341 / 360, s: .0, v: .95 },
            // chem2B: "#f2306d",// { h: 341 / 360, s: .8, v: .95 },
            backgroundA: '#FFFFFF',
            // backgroundB: '#F9E1E9',
            colorMin: .15,
            colorMax: .3,
        },
        computeParams: {
            F: 0.037,
            K: 0.06,
            // F: 0.078,
            // K: 0.061,
            scaleA: 1.0,
            scaleB: 1.0,
            // scaleA: 1.05,
            // scaleB: .80,
            // scaleA: 1.0,
            // scaleB: .95,
            diffusionScale: 2.0,
            stepsPerFrame: 1,
        },
        noise: {
            noiseSpeedA: .003 / 5,
            noiseStrengthA: .035,
            noiseDensityA: 1,

            noiseSpeedB: .01,
            noiseStrengthB: .0,
            noiseDensityB: 4,
        },
        initialize: {
            probabilityA: .01,
            probabilityB: .01,
        }
    }

    function restart() {

    }
    let regl:Regl.Regl
    onMount(async () => {
        regl = Regl({
            canvas,
            pixelRatio: 1.0,
            extensions: ["OES_texture_float"],
            optionalExtensions: ['oes_texture_half_float'],
            attributes: { antialias: false },
        });
        const drawFn = makeDrawImage(regl);
        const computeFn = makeComputeFn(regl);
        const initialize = makeInitFn(regl)

        const w = Math.min(2048, 1 * Math.round(width / 2))
        const h = Math.min(2048, 1 * Math.round(height / 2))
        const states = [0, 1].map(i => regl.framebuffer({
            colorType: regl.hasExtension('oes_texture_half_float') ? 'half float' : 'float',
            width: w,
            height: h,
            depthStencil: false
        }))
        let duv = [0, -0.0]
        let suv = [1, 1.]
        initialize({
            duv,
            suv,
            dst: states[0],
            // texture: textures[0],
            ...options.initialize
        });
        regl.frame(() => {
            for (let i = 0; i < options.computeParams.stepsPerFrame; i++) {
                computeFn({ src: states[0], dst: states[1], mouse: [-1, -1], ...options.computeParams,  ...options.noise })
                computeFn({ src: states[1], dst: states[0], mouse: [-1, -1], ...options.computeParams,  ...options.noise })
            }
            drawFn({
                colorA:[...hexToHSV(options.colors.chem1A), 1],
                colorB:[...hexToHSV(options.colors.chem1B), 1],
                background: [...hexToHSV(options.colors.backgroundA), 1],
                colorMin: options.colors.colorMin,
                colorMax: options.colors.colorMax,
                src: states[0]
            })
        });
    });

    onDestroy(() => {
        regl.destroy()
    })

</script>

<svelte:window bind:innerWidth={width} bind:innerHeight={height} on:resize={restart} />
<canvas bind:this={canvas} {width} {height} />
    
<style>
    canvas {
        position: fixed;
        z-index: -1;
        top:0px;
        left:0px;
        width: 100vw;
        height: 100vh;
        /* image-rendering: pixelated; */
        filter: blur(8px);
        /* opacity: .4; */
    }
</style>
