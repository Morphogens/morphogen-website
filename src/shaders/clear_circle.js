import { makeRandGLSL, isClose, sdAxisAlignedRect } from './utils'

export default function(regl) {
    return regl({
        vert: `
            precision mediump float;
            attribute vec2 xy;
            varying vec2 uv;
            void main () {
                uv = xy * 0.5 + 0.5;
                // uv.y = uv.y;
                gl_Position = vec4(xy, 0, 1);
            }
        `,
        frag: `
            precision mediump float;
            varying vec2 uv;
            uniform vec2 position;
            uniform float fillIndex;
            uniform float radius;
            
            ${makeRandGLSL}

            // float distance(vec2 a, vec2 b) {
            //     vec2 distanceVector = a - b;
            //     return sqrt(dot(distanceVector, distanceVector));
            // }

            float distSquared(vec2 A, vec2 B) {
                vec2 C = A - B;
                return dot(C, C);
            }

            
            void main () {
                if (distSquared(position, uv) < radius * radius) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
                } else {
                    discard;
                }
            }
        `,
        attributes: {xy: [-4, -4, 0, 4, 4, -4]},
        uniforms: {
            radius: regl.prop('radius'),
            position: regl.prop('position'),
            fillIndex: regl.prop('fillIndex')
        },
        framebuffer: regl.prop('dst'),
        depth: { enable: false },
        count: 3,
    });
}