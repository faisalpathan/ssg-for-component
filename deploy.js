const fs = require('fs');
const path = require('path');
const jsdom = require("jsdom");
const AWS = require('aws-sdk');
const { JSDOM } = jsdom;

// Enter copied or downloaded access ID and secret key here
const ID = 'AKIAY6YU3D4ZZPIW2KGI';
const SECRET = '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';

// The name of the bucket that you have created
const BUCKET_NAME = 'static-site-assets';

const s3 = new AWS.S3({
    accessKeyId: ID,
    secretAccessKey: SECRET
});

const currentVersion = 'v0.1'

const uploadFile = async (filePath, fileName, contentType = 'text/html') => {
    // Read content from the file
    const fileContent = await fs.promises.readFile(filePath, 'utf8')

    // Setting up S3 upload parameters
    const params = {
        Bucket: BUCKET_NAME,
        Key: `${currentVersion}/${fileName}`, // File name you want to save as in S3
        Body: fileContent,
        ContentType: contentType
    };

    // Uploading files to the bucket
    const uploadedDetails = await s3.upload(params).promise()
    return uploadedDetails.Location

};

const getFileName = path => {
    return path.split('/').pop()
}

const getAttrFromHtmlString = (string) => {
    const regex = new RegExp('[\\s\\r\\t\\n]*([a-z0-9\\-_]+)[\\s\\r\\t\\n]*=[\\s\\r\\t\\n]*([\'"])((?:\\\\\\2|(?!\\2).)*)\\2', 'ig');
    const attributes = {};
    while ((match = regex.exec(string))) {
        attributes[match[1]] = match[3];
    }
    return attributes
}

const isUrl = string => {
    try { 
        return Boolean(new URL(string)); }
    catch(e){ 
        return false; 
    }
}

const getAndUploadScriptTags = async (scriptList) => {
    let uploadedScriptPaths = scriptList.reduce((acc, val) => {
        const { src } = val
        if(src) {
            const fileName = getFileName(src)
            const filePath = path.resolve(`dist/${src}`);
            const uploadedScriptPath = uploadFile(filePath, fileName)
            acc.push(uploadedScriptPath)
        }
        return acc
    }, [])
    uploadedScriptPaths = await Promise.all(uploadedScriptPaths)
    return uploadedScriptPaths
}

const extractModifyAndUploadScriptTags = async (dom) => {
    const scriptList = [...dom.window.document.querySelectorAll("script")]
    const uploadedScriptPaths = await getAndUploadScriptTags(scriptList)
    const accumulatedScriptTags = []
    scriptList.forEach((currentScript) => {
        const currentFileName = getFileName(currentScript.src)
        uploadedScriptPaths.forEach(currentUploadedScriptPath => {
            if(getFileName(currentUploadedScriptPath) === currentFileName) {
                currentScript.src = currentUploadedScriptPath
            }
        })
        const { defer, type, src } = currentScript
        if(src && isUrl(src)) {
            accumulatedScriptTags.push({ src, isDefer: defer, type })
        }
    })
    return accumulatedScriptTags
}

const getAndUploadLinkTags = async (linkList) => {
    let uploadedLinkPaths = linkList.reduce((acc, val) => {
        const { href } = val
        if(href) {
            const fileName = getFileName(href)
            const filePath = path.resolve(`dist/${href}`);
            const isCssFile = fileName.split('.').pop().toLowerCase() === 'css'
            const uploadedLinkPath = uploadFile(filePath, fileName, isCssFile ? 'text/css' : undefined)
            acc.push(uploadedLinkPath)
        }
        return acc
    }, [])
    uploadedLinkPaths = await Promise.all(uploadedLinkPaths)
    return uploadedLinkPaths
}

const extractModifyAndUploadLinkTags = async (dom) => {
    const linkList = [...dom.window.document.querySelectorAll("link")]
    const uploadedLinkList = await getAndUploadLinkTags(linkList)
    const accumulatedLinkTags = []
    linkList.forEach((currentLink) => {
        const currentFileName = getFileName(currentLink.href)
        uploadedLinkList.forEach(currentUploadedScriptPath => {
            if(getFileName(currentUploadedScriptPath) === currentFileName) {
                currentLink.href = currentUploadedScriptPath
            }
        })
        const { rel, href } = currentLink
        if(href && isUrl(href)) {
            const { as } = getAttrFromHtmlString(currentLink.outerHTML)
            accumulatedLinkTags.push({ rel, href,  ...(as && { as }) })
        }
    })
    return accumulatedLinkTags
}

const writeContentAndUploadTheFile = async (path, fileName, content) => {
    await fs.promises.writeFile(`${path}/${fileName}`, content, 'utf8');
    await uploadFile(`${path}/${fileName}`, fileName)
}

const getHtmlContent = async () => {
    const uploadDirName = './uploads'
    const filePath = path.resolve("dist", "index.html");
    const htmlData = await fs.promises.readFile(filePath, 'utf8');
    const dom = new JSDOM(htmlData);
    const headerElement = dom.window.document.getElementById('root').innerHTML
    const [accumulatedScriptTags, accumulatedLinkTags] = await Promise.all([
        extractModifyAndUploadScriptTags(dom), 
        extractModifyAndUploadLinkTags(dom)
    ])

    if (fs.existsSync(uploadDirName)) {
        fs.rmSync(uploadDirName, { recursive: true, force: true });
    }

    fs.mkdirSync(uploadDirName, { recursive: true })

    const obj = {
        headLinkTag: accumulatedLinkTags,
        postBodyScriptTag: accumulatedScriptTags
    }

    await Promise.all([
        writeContentAndUploadTheFile(uploadDirName, 'header.html', headerElement),
        writeContentAndUploadTheFile(uploadDirName, 'assets.json', JSON.stringify(obj))
    ])
}

getHtmlContent()
console.log('deploy will start post build')