const validateUrl = (url) => {
    document.getElementById('url').style.removeProperty('border');

    if (url == null || url.length === 0) {
        document.getElementById('url').style.border = '2px solid red';
        throw 'Invalid URL';
    }
}

const addSpinner = () => {
    const spinner = document.createElement('div');
    spinner.classList.add('spinner');
    spinner.id = 'loading-spinner';

    document.getElementById('response-container').appendChild(spinner);
}

const fetchApi = async (url) => {
    const response = await fetch('https://verytiny.link', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            url
        })
    });

    const data = await response.json();

    if (!response.ok) {
        alert(data.errorMessage);
        document.getElementById('loading-spinner').remove();
        throw 'Error from API';
    }

    return data;
}

const createAndAppendLink = (shortId) => {
    const veryTinyUrl = `https://verytiny.link/${shortId}`;

    const link = document.createElement('a');
    link.href = veryTinyUrl;
    link.textContent = veryTinyUrl;
    link.title = veryTinyUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.display = 'block';

    document.getElementById('loading-spinner').remove();
    document.getElementById('response-container').appendChild(link);
}

const onSubmit = async (e) => {
    const url = document.getElementById('url').value;

    validateUrl(url);

    addSpinner();

    const data = await fetchApi(url);

    createAndAppendLink(data.shortId);
}
