Output assets/demo-install.gif

Require node

Set Shell "bash"
Set FontSize 16
Set Width 1200
Set Height 400
Set Theme "Catppuccin Mocha"
Set Padding 20
Set TypingSpeed 50ms
Set Framerate 30

# Prepend fake npx to PATH so "npx agents-reverse-engineer@latest" runs local CLI
Hide
Type "export PATH=/tmp/are-demo-bin:$PATH"
Enter
Sleep 200ms
Type "clear"
Enter
Sleep 500ms
Show

# User types the install command
Type "npx agents-reverse-engineer@latest"
Sleep 500ms
Enter

# npx "Ok to proceed?" prompt
Sleep 500ms
Enter

# Wait for banner + golden circle animation
Sleep 4s

# Select "Claude Code" (already highlighted as default)
Enter
Sleep 4s

# Select "Local" (second option — press Down)
Down
Sleep 1s
Enter

# Wait for installation to complete and results to display
Sleep 5s
