window.onload = function () {
    var header = document.getElementById('header');
    var content = document.getElementById('content');

    // Get the height of the header
    var headerHeight = header.offsetHeight;

    // Set the top margin of the content to the height of the header
    content.style.marginTop = 1.15  * headerHeight + 'px';
}