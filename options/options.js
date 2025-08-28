document.addEventListener('submit', async function (e) {
    e.preventDefault();
    const maxResults = parseInt(document.getElementById('maxResults').value);
    browser.storage.sync.set({ maxResults }, function (result) {
        console.log('Settings saved');
    });
});

document.addEventListener('DOMContentLoaded', function () {
    browser.storage.sync.get(['maxResults']).then(function (result) {
        if (result.maxResults === undefined || result.maxResults < 1 || result.maxResults == null) {
            result.maxResults = 100;
        }
        document.getElementById('maxResults').value = result.maxResults;
        console.log('Settings loaded', result);
    })
});