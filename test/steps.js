const TIMEOUT = 10000;

function step(drivers, cb, logMessage) {
    return Promise.all(drivers.map(driver => {
        return cb(driver);
    })).then(() => {
        if (logMessage) {
            console.log(logMessage);
        }
    });
}
function waitNVideosExist(driver, n) {
    return driver.wait(() => {
        return driver.executeScript(n => document.querySelectorAll('video').length === n, n);
    }, TIMEOUT);
}

function waitAllVideosHaveEnoughData(driver) {
    return driver.wait(() => {
        return driver.executeScript(() => {
            const videos = document.querySelectorAll('video');
            let ready = 0;
            for (let i = 0; i < videos.length; i++) {
                if (videos[i].readyState >= videos[i].HAVE_ENOUGH_DATA) {
                    ready++;
                }
            }
            return ready === videos.length;
        });
    }, TIMEOUT);
}

module.exports = {
    step,
    waitNVideosExist,
    waitAllVideosHaveEnoughData,
};