module.exports = (regl) => {
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
            uniform float scale;
            uniform float random;
            uniform float offsety;
            uniform float p_respawn;
            uniform float p_cull;

            varying vec2 uv;
            uniform vec4 rect;

            float PHI = 1.61803398874989484820459 * 00000.1; // Golden Ratio
            float PI  = 3.14159265358979323846264 * 00000.1; // PI
            float SQ2 = 1.41421356237309504880169 * 10000.0; // Square Root of Two

            float gold_noise(in vec2 coordinate, in float seed){
                return fract(tan(distance(coordinate*(seed+PHI), vec2(PHI, PI)))*SQ2);
            }

            void main() {
                vec4 data = texture2D(u_src, uv);
                vec4 imgdata = texture2D(u_src, vec2(uv.x, uv.y + offsety));

                float rand = gold_noise(uv, random);

                float n = 0.0;
                for(int dx=-1; dx<=1; ++dx) {
                    for(int dy=-1; dy<=1; ++dy) {
                        n += texture2D(u_src, uv + vec2(dx, dy)*u_size).x;
                    }
                }
                float s = texture2D(u_src, uv).x;

                if (uv.x > rect.x && uv.x < rect.z && uv.y > rect.y && uv.y < rect.w) {
                    gl_FragColor = vec4(0, data.yzw);
                } else if (imgdata.y > .99 && rand < p_respawn) { //.009
                    gl_FragColor = vec4(1, data.yzw);
                } else if (imgdata.y < 0.1 && rand < p_cull) { //.004
                    gl_FragColor = vec4(0, data.yzw);
                } else if (n > 3.0+s || n < 3.0) {
                    gl_FragColor = vec4(0, data.yzw);
                } else {
                    gl_FragColor = vec4(1, data.yzw);
                }
            }
        `,
        attributes: {xy: [-4, -4, 0, 4, 4, -4]},
        uniforms: {
            p_respawn: regl.prop('p_respawn'),
            p_cull: regl.prop('p_cull'),
            random: regl.prop('random'),
            offsety: regl.prop('offsety'),
            rect: regl.prop('rect'),
            scale: 0.5,
            u_src: regl.prop('src'),
            u_size: ctx => [1 / ctx.framebufferWidth, 1 / ctx.framebufferHeight],
        },
        framebuffer: regl.prop('dst'),
        depth: { enable: false },
        count: 3
    });
}