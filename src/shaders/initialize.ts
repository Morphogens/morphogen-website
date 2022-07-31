import { noise3 } from './noise';
import { makeRandGLSL } from './utils'

export default function (regl) {
    return regl({
        uniforms: {
            // texture: regl.prop('texture'),
            duv: regl.prop('duv'),
            suv: regl.prop('suv'),
            probabilityA: regl.prop('probabilityA'),
            probabilityB: regl.prop('probabilityB'),
            time: () => {
                // window.performance.now()
                const now = new Date()  
                console.log((now.getTime() % 100) / 100);
                
                return (now.getTime() % 100) / 100
            }
        },
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
            uniform sampler2D texture;
            uniform float probabilityA;
            uniform float probabilityB;
            uniform float time;
            uniform vec2 duv;
            uniform vec2 suv;
            varying vec2 uv;
            
            ${makeRandGLSL}
            ${noise3}

            void main () {
                // vec4 val = texture2D(texture, (uv+duv)*suv);
                vec4 result = vec4(1.0, 0.0, 1.0, 0.0);
                float rand = makeRand(uv);
                float noiseA = simplex3d_fractal(
                    vec3(uv, time) * 8.0 + 8.0
                );
                //  &&  < .5
                float dist = length(uv - vec2(.5, .5));
                // && noiseA - (.1 * dist) > .2
                // noiseA > 0.0 && 
                if (rand > 0.67) {
                    result.x = 0.5;
                    result.y = 0.25;
                } 
                gl_FragColor = result;
            }
        `,
        attributes: { xy: [-4, -4, 0, 4, 4, -4] },
        framebuffer: regl.prop('dst'),
        depth: { enable: false },
        count: 3,
    });
}