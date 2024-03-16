window.onload = function () {
    var header = document.getElementById('header');
    var content = document.getElementById('content');
    var photo = document.getElementById('profile-photo');

    // Get the height of the header
    var headerHeight = header.offsetHeight;

    // Set the top margin of the content to the height of the header
    photo.style.marginTop = headerHeight + 'px';
    content.style.marginTop =  headerHeight + 'px';
}

$(function () {
    $("#header").load("header.html");
    $("#footer").load("footer.html");
});
var links = ['about', 'work', 'labs', 'words'];

links.forEach(function (link) {
    document.querySelector('#' + link + '-link').addEventListener('click', function (e) {
        e.preventDefault();
        var headerHeight = document.querySelector('#header').offsetHeight;
        var target = document.querySelector('#' + link);
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.scrollBy(0, -headerHeight);
    });
});