const profileImage = document.getElementById("profileImage");

// Load saved image
const savedImage = localStorage.getItem("profileImage");
if (savedImage) {
    profileImage.src = savedImage;
}

function uploadImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function () {
        localStorage.setItem("profileImage", reader.result);
        profileImage.src = reader.result;
    };
    reader.readAsDataURL(file);
}
