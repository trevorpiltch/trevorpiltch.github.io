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