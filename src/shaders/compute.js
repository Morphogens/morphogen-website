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
            uniform sampler2D u_src;
            uniform vec2 u_size;
            varying vec2 uv;
            const float F = 0.037, K = 0.06;
            const vec2 center = vec2(0.5, 0.5);
            
            ${makeRandGLSL}

            void main() {
                float radius = 2.0 * distance(uv, center);
                radius = pow(radius, 2.0); // Exponential
                float scale = mix(1.0, .85, radius);
                float D_a = 0.1*scale;
                float D_b = 0.05;
                float f = F;
                // float k = K;
                // float f = mix(1.0 * F, 0.8 * F, radius*1.2);
                float k = mix(1.0 * K, 1.03 * K, radius);

                vec4 n = texture2D(u_src, uv + vec2(0.0, 1.0)*u_size),
                     e = texture2D(u_src, uv + vec2(1.0, 0.0)*u_size),
                     s = texture2D(u_src, uv + vec2(0.0, -1.0)*u_size),
                     w = texture2D(u_src, uv + vec2(-1.0, 0.0)*u_size),

                     ne = texture2D(u_src, uv + vec2(1.0, 1.0)*u_size),
                     nw = texture2D(u_src, uv + vec2(-1.0, 1.0)*u_size),
                     se = texture2D(u_src, uv + vec2(1.0, -1.0)*u_size),
                     sw = texture2D(u_src, uv + vec2(-1.0, -1.0)*u_size);

                vec4 val = texture2D(u_src, uv);

                vec4 lap = (0.5 * (n + s + e + w) + 0.25 * (ne + nw + se + sw) - 3.0 * val);

                val += vec4(D_a * lap.x - val.x*val.y*val.y + f * (1.0-val.x),
                            D_b * lap.y + val.x*val.y*val.y - (k+f) * val.y,
                            D_a * lap.z - val.z*val.w*val.w + f * (1.0-val.z),
                            D_b * lap.w + val.z*val.w*val.w - (k+f) * val.w);

                /*  Make the two systems mutually exclusive by having the
                    dominant suppress the other. */
                if (val.y > val.w) {
                    gl_FragColor = vec4(val.x, val.y, val.z, val.w/2.0);
                } else {
                    gl_FragColor = vec4(val.x, val.y/2.0, val.z, val.w);
                }
                // gl_FragColor = vec4(radius, 0.0, 0.0, 1.0);
            }
        `,
        attributes: {xy: [-4, -4, 0, 4, 4, -4]},
        uniforms: {
            // scale: 0.5,
            u_src: regl.prop('src'),
            u_size: ctx => [1 / ctx.framebufferWidth, 1 / ctx.framebufferHeight],
        },
        framebuffer: regl.prop('dst'),
        depth: { enable: false },
        count: 3
    });
}