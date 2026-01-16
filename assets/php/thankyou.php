<?php
// ... email processing code ...

if ($success) {
    header('Location: thankyou.html');
    die(); // Important to stop script execution after redirect
} else {
    // handle error
}
?>