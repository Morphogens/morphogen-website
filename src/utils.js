// export function loadImage(url:string): Promise<HTMLImageElement> {
export function loadImage(url) {
    return new Promise((resolve, reject) => {
        const image = new Image()
        image.addEventListener('load', () => resolve(image))
        image.addEventListener('error', (e) => reject(e))
        image.src = url
    })
}

export function lerp(a, b, v) {
    return [
        (1 - v) * a[0] + v * b[0],
        (1 - v) * a[1] + v * b[1],
        (1 - v) * a[2] + v * b[2],
        // (1 - v) * a[3] + v * b[3]
    ]
}

export function randomUint8List(size) {
    const result = []
    for (let i = 0; i < size; i++) {
        result.push(Math.floor(255 * Math.random()))
    }
    return result
}

export function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) { return null }
    return [
        parseInt(result[1], 16) / 255.0,
        parseInt(result[2], 16) / 255.0,
        parseInt(result[3], 16) / 255.0,
    ]
}


export function rgbToHSV(rgba) {
    const [r, g, b] = rgba
    let v = Math.max(r, g, b)
    let c = v - Math.min(r, g, b)
    let h = c && ((v == r) ? (g - b) / c : ((v == g) ? 2 + (b - r) / c : 4 + (r - g) / c));
    return [(60 * (h < 0 ? h + 6 : h)) / 360, v && c / v, v];
}
// export function rgbToHSV(rgb) {
//     let [r,g,b] = rgb
//     var max = Math.max(r, g, b), min = Math.min(r, g, b),
//         d = max - min,
//         h,
//         s = (max === 0 ? 0 : d / max),
//         v = max / 255;

//     switch (max) {
//         case min: h = 0; break;
//         case r: h = (g - b) + d * (g < b ? 6: 0); h /= 6 * d; break;
//         case g: h = (b - r) + d * 2; h /= 6 * d; break;
//         case b: h = (r - g) + d * 4; h /= 6 * d; break;
//     }

//     return [h, s, v]
// }
export function hexToHSV(hex) {
    return rgbToHSV(hexToRgb(hex))
}

export function hsv2rgb(hsv) {
    // HSV in [0, 1]                           
    let [h, s, v] = hsv
    h = Math.floor(h * 360)
    let f = (n, k = (n + h / 60) % 6) => v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
    return [f(5), f(3), f(1)]
}
/* accepts parameters
 * h  Object = {h:x, s:y, v:z}
 * OR 
 * h, s, v
*/
// function hsv2rgb(hsv) {
//     let [h, s, v] = hsv
//     var r, g, b, i, f, p, q, t;
//     i = Math.floor(h * 6);
//     f = h * 6 - i;
//     p = v * (1 - s);
//     q = v * (1 - f * s);
//     t = v * (1 - (1 - f) * s);
//     switch (i % 6) {
//         case 0: r = v, g = t, b = p; break;
//         case 1: r = q, g = v, b = p; break;
//         case 2: r = p, g = v, b = t; break;
//         case 3: r = p, g = q, b = v; break;
//         case 4: r = t, g = p, b = v; break;
//         case 5: r = v, g = p, b = q; break;
//     }
//     // console.log(hsv, [
//     //     Math.round(r * 255),
//     //     Math.round(g * 255),
//     //     Math.round(b * 255)
//     // ]);
//     return [
//         r,
//         g,
//         b
//     ]
// }

export function rgb2hex(rgba) {
    return '#' + rgba.map(v => (Math.floor(v * 255)).toString(16)).join('')
}

export function hsv2hex(hsv) {
    return rgb2hex(hsv2rgb(hsv))
}
export function hsvObjToHex({h, s, v}) {
    return rgb2hex(hsv2rgb([h, s, v]))
}