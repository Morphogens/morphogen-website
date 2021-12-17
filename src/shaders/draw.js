
import { hsv2rgb } from './utils'
export default function(regl) {
    return regl({
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
            varying vec2 uv;
            uniform sampler2D src;
            uniform vec4 colorA;
            uniform vec4 colorB;
            uniform vec4 background;
            const float COLOR_MIN = 0.15, COLOR_MAX = 0.3;
            
            ${hsv2rgb}

            float remap( float minval, float maxval, float curval ) {
                return clamp(( curval - minval ) / ( maxval - minval ), 0.0, 1.0);
            }
            
            void main() {
                vec4 pixel = texture2D(src, uv);
                float v1 = remap(COLOR_MIN, COLOR_MAX, pixel.y);
                float v2 = remap(COLOR_MIN, COLOR_MAX, pixel.w);
                if (v1 > v2) {
                    gl_FragColor = hsv2rgb(mix(background, colorA, v1));
                    // gl_FragColor = hsv2rgb(colorA);

                    // gl_FragColor = mix(hsv2rgb(background), hsv2rgb(colorA), v1);
                } else {
                    gl_FragColor = hsv2rgb(mix(background, colorB, v2));
                    // gl_FragColor = hsv2rgb(colorB);

                    // gl_FragColor = mix(hsv2rgb(background), hsv2rgb(colorB), v2);
                }
                // gl_FragColor = hsv2rgb(colorB);
                // gl_FragColor = hsv2rgb(mix(background, colorA, .5));
            }
        `,
        uniforms: {
            colorA: regl.prop('colorA'),
            colorB: regl.prop('colorB'),
            background: regl.prop('background'),
            src: regl.prop('src'),
        },
        attributes: {xy: [-4, -4, 0, 4, 4, -4]},
        depth: {enable: false},
        count: 3
    });
}