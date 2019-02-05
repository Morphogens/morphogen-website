module.exports = (regl) => {
    return regl({
        vert: `
            precision mediump float;
            attribute vec2 xy;
            varying vec2 uv;
            void main () {
                uv = xy * 0.5 + 0.5;
                // uv.y = 1.0 - uv.y;
                gl_Position = vec4(xy, 0, 1);
            }
        `,
        frag: `
            precision mediump float;
            uniform sampler2D u_src;
            uniform sampler2D old_texture;
            uniform sampler2D new_texture;
            uniform sampler2D random;
            varying vec2 uv;
            void main () {
                vec4 oldv = texture2D(u_src, uv);
                bool old_text = oldv.y > 0.2;
                bool new_seed = texture2D(new_texture, uv).g > 0.2;
                bool new_bound = texture2D(new_texture, uv).r > 0.2;
                bool old_seed = texture2D(old_texture, uv).g > 0.2;
                bool old_bound = texture2D(old_texture, uv).r > 0.2;
                vec4 result = oldv;
                vec4 rand = texture2D(random, uv);

                /* Clear morph2 to allow morph1 to grow.
                */

                if (old_bound && new_bound) {

                }

                if (!new_bound) {
                    result.zw = vec2(1.0, 0.0);
                }

                if (new_seed) {
                    if (rand.x > 0.8) {
                        result.xy = vec2(0.5, 0.25);
                    } else {
                        result.xy = vec2(1.0, 0.0);
                    }
                }

                if (old_text) {
                    result.xy = vec2(1.0, 0.0);
                }

                if (new_bound) {
                    if (old_bound) {
                        result.zw = oldv.zw;
                    }
                    else if (rand.y > 0.9) {
                        result.zw = vec2(0.5, 0.25);
                    } else {
                        result.zw = vec2(1.0, 0.0);
                    }
                }
                gl_FragColor = result;
            }
        `,
        attributes: {xy: [-4, -4, 0, 4, 4, -4]},
        uniforms: {
            u_src: regl.prop('src'),
            old_texture: regl.prop('old_texture'),
            new_texture: regl.prop('new_texture'),
            random: regl.prop('random')
            // regl.texture({
            //     width: 512, height: 256, data: random_list(512*256*4)
            // })
        },
        framebuffer: regl.prop('dst'),
        depth: {enable: false},
        count: 3,
    });
}