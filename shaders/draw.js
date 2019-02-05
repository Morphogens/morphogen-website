
function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) { return null }
    return  [
        parseInt(result[1], 16) / 255.0,
        parseInt(result[2], 16) / 255.0,
        parseInt(result[3], 16) / 255.0,
        1.0
    ]
}
module.exports = (regl) => {
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
            uniform int show;
            uniform vec4 colorA;
            uniform vec4 colorB;

            const float COLOR_MIN = 0.15, COLOR_MAX = 0.3;
            const vec4 WHITE = vec4( 1.0, 1.0, 1.0, 1.0 );

            float remap( float minval, float maxval, float curval ) {
                return ( curval - minval ) / ( maxval - minval );
            }

            void main() {
                vec4 pixel = texture2D(src, uv);
                float v1 = remap(COLOR_MIN, COLOR_MAX, pixel.y);
                float v2 = remap(COLOR_MIN, COLOR_MAX, pixel.w);

                if (show == 1) {
                    gl_FragColor = mix( WHITE, colorA, v1 );
                } else if (show == 2) {
                    gl_FragColor = mix( WHITE, colorB, v2 );
                } else if (show == 3) {
                    if (v2 < v1) {
                        gl_FragColor = mix( WHITE, colorA, v1 );
                    } else {
                        gl_FragColor = mix( WHITE, colorB, v2 );
                    }
                } else {
                    gl_FragColor = vec4(1, 1, 1, 1);
                }
            }
        `,
        uniforms: {
            colorA: regl.prop('colorA'),//hexToRgb("#0000e0"),
            colorB: regl.prop('colorB'),
            src: regl.prop('src'),
            show: 3,
        },
        attributes: {xy: [-4, -4, 0, 4, 4, -4]},
        depth: {enable: false},
        count: 3
    });
}