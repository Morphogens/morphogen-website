import { noise3 } from './noise'

export default function(regl) {
    return regl({
        uniforms: {
            F: regl.prop('F'),
            K: regl.prop('K'),
            scaleA: regl.prop('scaleA'),
            scaleB: regl.prop('scaleB'),
            diffusionScale: regl.prop('diffusionScale'),
            
            noiseSpeedA: regl.prop('noiseSpeedA'),
            noiseStrengthA: regl.prop('noiseStrengthA'),
            noiseDensityA: regl.prop('noiseDensityA'),
            
            noiseSpeedB: regl.prop('noiseSpeedB'),
            noiseStrengthB: regl.prop('noiseStrengthB'),
            noiseDensityB: regl.prop('noiseDensityB'),

            mouse: regl.prop('mouse'),
            u_src: regl.prop('src'),
            u_size: ctx => [1 / ctx.framebufferWidth, 1 / ctx.framebufferHeight],
            time: ({ tick }) => tick
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
            uniform sampler2D u_src;
            uniform vec2 u_size;
            uniform float F;
            uniform float K;
            uniform float scaleA;
            uniform float scaleB;
            uniform float diffusionScale;
            uniform float time;
            uniform vec2 mouse;
            varying vec2 uv;

            uniform float noiseSpeedA;
            uniform float noiseStrengthA;
            uniform float noiseDensityA;

            uniform float noiseSpeedB;
            uniform float noiseStrengthB;
            uniform float noiseDensityB;

            // const float F = 0.037, K = 0.06;
            const vec2 center = vec2(0.5, 0.5);
            
            ${noise3}
            
            float distSquared(vec2 A, vec2 B) {
                vec2 C = A - B;
                return dot(C, C);
            }

            void main() {
                // float radius = 2.0 * distance(uv, center);
                // radius = pow(radius, 1.0); // Exponential
                // float scale = mix(1.05, .85, radius);
                
                float scale = scaleA;//mix(scaleA, scaleB, radius);
                // float D_a = diffusionScale * 0.1*scale;
                // float D_b = diffusionScale * 0.05;
                float D_a = .2097 * 0.5;
                float D_b = .105 *0.5;
                float f = F;
                // float k_a = mix(1.0 * K, 1.06 * K, radius);
                // float k_b = mix(1.0 * K, 1.06 * K, radius);
                float k_a = K;
                float k_b = K;

                float noiseA = simplex3d_fractal(
                    vec3(uv, time * noiseSpeedA) * noiseDensityA + 8.0
                );
                float noiseB = simplex3d_fractal(
                    vec3(uv, time * noiseSpeedB) * noiseDensityB + 8.0
                );
                
                float mouseRadius = .05;
                if (distSquared(mouse, uv) < mouseRadius * mouseRadius) {
                    k_a += .01 + noiseA * .2;
                    k_b += .01 + noiseB * .2;
                } else {
                    k_a += noiseA * noiseStrengthA;
                    k_b += noiseB * noiseStrengthB;
                }

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
                            D_b * lap.y + val.x*val.y*val.y - (k_a+f) * val.y,
                            D_a * lap.z - val.z*val.w*val.w + f * (1.0-val.z),
                            D_b * lap.w + val.z*val.w*val.w - (k_b+f) * val.w);

                /*  Make the two systems mutually exclusive by having the
                    dominant suppress the other. */
                if (val.y > val.w) {
                    gl_FragColor = vec4(val.x, val.y, val.z, val.w/2.0);
                } else {
                    gl_FragColor = vec4(val.x, val.y/2.0, val.z, val.w);
                }
            }
        `,
        attributes: {xy: [-4, -4, 0, 4, 4, -4]},
        framebuffer: regl.prop('dst'),
        depth: { enable: false },
        count: 3
    });
}