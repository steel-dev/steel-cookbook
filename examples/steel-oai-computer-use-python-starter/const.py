"""
Constants for keypress handling in the Steel Computer Use Assistant.
These mappings are used to convert user-friendly key names to Playwright's keyboard API format.
"""

# Modifier keys that can be used with other keys
MODIFIERS = {
    "ALT": "Alt",
    "CTRL": "Control",
    "CONTROL": "Control",
    "SHIFT": "Shift",
    "META": "Meta",
    "COMMAND": "Meta",
    "CMD": "Meta",
    "WIN": "Meta",
}

# Mapping of common key names to Playwright keyboard API keys
PLAYWRIGHT_KEYS = {
    "ALT": "Alt",
    "ARROWDOWN": "ArrowDown",
    "ARROWLEFT": "ArrowLeft",
    "ARROWRIGHT": "ArrowRight",
    "ARROWUP": "ArrowUp",
    "UP": "ArrowUp",
    "DOWN": "ArrowDown",
    "LEFT": "ArrowLeft",
    "RIGHT": "ArrowRight",
    "BACKSPACE": "Backspace",
    "CAPSLOCK": "CapsLock",
    "CMD": "Meta",
    "COMMAND": "Meta",
    "CTRL": "Control",
    "CONTROL": "Control",
    "DELETE": "Delete",
    "END": "End",
    "ENTER": "Enter",
    "ESC": "Escape",
    "ESCAPE": "Escape",
    "HOME": "Home",
    "INSERT": "Insert",
    "OPTION": "Alt",
    "PAGEDOWN": "PageDown",
    "PAGEUP": "PageUp",
    "SHIFT": "Shift",
    "SPACE": " ",
    "SUPER": "Meta",
    "TAB": "Tab",
}
