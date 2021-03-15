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
        (1-v)*a[0]+ v*b[0],
        (1-v)*a[1]+ v*b[1],
        (1-v)*a[2]+ v*b[2],
        (1-v)*a[3]+ v*b[3]
    ]
}

export function randomUint8List(size) {
    const result = []
    for (let i = 0; i < size; i++) {
        result.push(Math.floor(255*Math.random()))
    }
    return result
}

export function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) { return null }
    return  [
        parseInt(result[1], 16) / 255.0,
        parseInt(result[2], 16) / 255.0,
        parseInt(result[3], 16) / 255.0,
        1.0
    ]
}