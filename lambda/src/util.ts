export const randomString = () => {
    const charSet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890'

    const length = parseInt(process.env.STRING_LENGTH || '4')

    let s = ''

    for (let i = 0; i < length; i++) {
        s += charSet.charAt(Math.random() * (charSet.length - 1))
    }

    return s
}
