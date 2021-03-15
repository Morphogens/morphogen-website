import { makeRandGLSL } from './utils'

export default function(regl) {
    return regl({
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
            uniform vec2 duv;
            uniform vec2 suv;
            varying vec2 uv;
            
            ${makeRandGLSL}

            void main () {
                vec4 val = texture2D(texture, (uv+duv)*suv);
                vec4 result = vec4(1.0, 0.0, 1.0, 0.0);
                float rand = makeRand(uv);
                if (val.g > 0.5 && rand > .75) {
                    result.x = 0.5;
                    result.y = 0.25;
                } else if (val.r > 0.5 && rand > .75) {
                    result.z = 0.5;
                    result.w = 0.25;
                }
                gl_FragColor = result;
            }
        `,
        attributes: {xy: [-4, -4, 0, 4, 4, -4]},
        uniforms: {
            texture: regl.prop('texture'),
            duv: regl.prop('duv'),
            suv: regl.prop('suv'),
        },
        framebuffer: regl.prop('dst'),
        depth: { enable: false },
        count: 3,
    });
}