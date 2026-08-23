use core_graphics::event::{
    CGEvent, CGEventFlags, CGEventTapLocation, CGEventType, EventField, KeyCode,
};
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
use core_graphics::geometry::CGPoint;

use crate::engine::AUTOCLICKER_EXTRA_INFO;

pub const VK_LBUTTON: u16 = 0x01;
pub const VK_RBUTTON: u16 = 0x02;
pub const VK_MBUTTON: u16 = 0x04;
pub const VK_XBUTTON1: u16 = 0x05;
pub const VK_XBUTTON2: u16 = 0x06;
pub const VK_BACK: u16 = 0x08;
pub const VK_TAB: u16 = 0x09;
pub const VK_RETURN: u16 = 0x0D;
pub const VK_SHIFT: u16 = 0x10;
pub const VK_CONTROL: u16 = 0x11;
pub const VK_MENU: u16 = 0x12;
pub const VK_PAUSE: u16 = 0x13;
pub const VK_CAPITAL: u16 = 0x14;
pub const VK_ESCAPE: u16 = 0x1B;
pub const VK_SPACE: u16 = 0x20;
pub const VK_PRIOR: u16 = 0x21;
pub const VK_NEXT: u16 = 0x22;
pub const VK_END: u16 = 0x23;
pub const VK_HOME: u16 = 0x24;
pub const VK_LEFT: u16 = 0x25;
pub const VK_UP: u16 = 0x26;
pub const VK_RIGHT: u16 = 0x27;
pub const VK_DOWN: u16 = 0x28;
pub const VK_SNAPSHOT: u16 = 0x2C;
pub const VK_INSERT: u16 = 0x2D;
pub const VK_DELETE: u16 = 0x2E;
pub const VK_LWIN: u16 = 0x5B;
pub const VK_RWIN: u16 = 0x5C;
pub const VK_APPS: u16 = 0x5D;
pub const VK_NUMPAD0: u16 = 0x60;
pub const VK_NUMPAD1: u16 = 0x61;
pub const VK_NUMPAD2: u16 = 0x62;
pub const VK_NUMPAD3: u16 = 0x63;
pub const VK_NUMPAD4: u16 = 0x64;
pub const VK_NUMPAD5: u16 = 0x65;
pub const VK_NUMPAD6: u16 = 0x66;
pub const VK_NUMPAD7: u16 = 0x67;
pub const VK_NUMPAD8: u16 = 0x68;
pub const VK_NUMPAD9: u16 = 0x69;
pub const VK_MULTIPLY: u16 = 0x6A;
pub const VK_ADD: u16 = 0x6B;
pub const VK_SUBTRACT: u16 = 0x6D;
pub const VK_DECIMAL: u16 = 0x6E;
pub const VK_DIVIDE: u16 = 0x6F;
pub const VK_F1: u16 = 0x70;
pub const VK_NUMLOCK: u16 = 0x90;
pub const VK_SCROLL: u16 = 0x91;
pub const VK_LSHIFT: u16 = 0xA0;
pub const VK_RSHIFT: u16 = 0xA1;
pub const VK_LCONTROL: u16 = 0xA2;
pub const VK_RCONTROL: u16 = 0xA3;
pub const VK_LMENU: u16 = 0xA4;
pub const VK_RMENU: u16 = 0xA5;
pub const VK_OEM_1: u16 = 0xBA;
pub const VK_OEM_PLUS: u16 = 0xBB;
pub const VK_OEM_COMMA: u16 = 0xBC;
pub const VK_OEM_MINUS: u16 = 0xBD;
pub const VK_OEM_PERIOD: u16 = 0xBE;
pub const VK_OEM_2: u16 = 0xBF;
pub const VK_OEM_3: u16 = 0xC0;
pub const VK_OEM_4: u16 = 0xDB;
pub const VK_OEM_5: u16 = 0xDC;
pub const VK_OEM_6: u16 = 0xDD;
pub const VK_OEM_7: u16 = 0xDE;
pub const VK_OEM_102: u16 = 0xE2;

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGEventSourceFlagsState(state_id: CGEventSourceStateID) -> CGEventFlags;
}

pub fn event_is_ours(event: &CGEvent) -> bool {
    event.get_integer_value_field(EventField::EVENT_SOURCE_USER_DATA)
        == AUTOCLICKER_EXTRA_INFO as i64
}

fn mark_event(event: &CGEvent) {
    event.set_integer_value_field(
        EventField::EVENT_SOURCE_USER_DATA,
        AUTOCLICKER_EXTRA_INFO as i64,
    );
}

fn source() -> Option<CGEventSource> {
    CGEventSource::new(CGEventSourceStateID::HIDSystemState).ok()
}

pub fn post_mouse_event(
    event_type: CGEventType,
    button: core_graphics::event::CGMouseButton,
    point: CGPoint,
) {
    let Some(source) = source() else { return };
    let Ok(event) = CGEvent::new_mouse_event(source, event_type, point, button) else {
        return;
    };
    mark_event(&event);
    event.post(CGEventTapLocation::HID);
}

pub fn post_keyboard_event(vk: u16, down: bool, shifted: bool) {
    let Some(keycode) = mac_keycode_for_vk(vk) else {
        return;
    };
    let Some(source) = source() else { return };
    let Ok(event) = CGEvent::new_keyboard_event(source, keycode, down) else {
        return;
    };
    if shifted {
        event.set_flags(CGEventFlags::CGEventFlagShift);
    }
    mark_event(&event);
    event.post(CGEventTapLocation::HID);
}

pub fn caps_lock_enabled() -> bool {
    unsafe { CGEventSourceFlagsState(CGEventSourceStateID::CombinedSessionState) }
        .contains(CGEventFlags::CGEventFlagAlphaShift)
}

pub fn mouse_vk_for_event(event_type: CGEventType, event: &CGEvent) -> Option<(i32, bool)> {
    match event_type {
        CGEventType::LeftMouseDown => Some((VK_LBUTTON as i32, true)),
        CGEventType::LeftMouseUp => Some((VK_LBUTTON as i32, false)),
        CGEventType::RightMouseDown => Some((VK_RBUTTON as i32, true)),
        CGEventType::RightMouseUp => Some((VK_RBUTTON as i32, false)),
        CGEventType::OtherMouseDown | CGEventType::OtherMouseUp => {
            let button = event.get_integer_value_field(EventField::MOUSE_EVENT_BUTTON_NUMBER);
            let vk = match button {
                2 => VK_MBUTTON,
                3 => VK_XBUTTON1,
                4 => VK_XBUTTON2,
                _ => return None,
            };
            Some((vk as i32, matches!(event_type, CGEventType::OtherMouseDown)))
        }
        _ => None,
    }
}

pub fn modifier_flag_for_mac_keycode(code: u16) -> Option<CGEventFlags> {
    match code {
        KeyCode::SHIFT | KeyCode::RIGHT_SHIFT => Some(CGEventFlags::CGEventFlagShift),
        KeyCode::CONTROL | KeyCode::RIGHT_CONTROL => Some(CGEventFlags::CGEventFlagControl),
        KeyCode::OPTION | KeyCode::RIGHT_OPTION => Some(CGEventFlags::CGEventFlagAlternate),
        KeyCode::COMMAND | KeyCode::RIGHT_COMMAND => Some(CGEventFlags::CGEventFlagCommand),
        KeyCode::CAPS_LOCK => Some(CGEventFlags::CGEventFlagAlphaShift),
        _ => None,
    }
}

pub fn mac_keycode_for_vk(vk: u16) -> Option<u16> {
    let key = match vk {
        0x41 => KeyCode::ANSI_A,
        0x42 => KeyCode::ANSI_B,
        0x43 => KeyCode::ANSI_C,
        0x44 => KeyCode::ANSI_D,
        0x45 => KeyCode::ANSI_E,
        0x46 => KeyCode::ANSI_F,
        0x47 => KeyCode::ANSI_G,
        0x48 => KeyCode::ANSI_H,
        0x49 => KeyCode::ANSI_I,
        0x4A => KeyCode::ANSI_J,
        0x4B => KeyCode::ANSI_K,
        0x4C => KeyCode::ANSI_L,
        0x4D => KeyCode::ANSI_M,
        0x4E => KeyCode::ANSI_N,
        0x4F => KeyCode::ANSI_O,
        0x50 => KeyCode::ANSI_P,
        0x51 => KeyCode::ANSI_Q,
        0x52 => KeyCode::ANSI_R,
        0x53 => KeyCode::ANSI_S,
        0x54 => KeyCode::ANSI_T,
        0x55 => KeyCode::ANSI_U,
        0x56 => KeyCode::ANSI_V,
        0x57 => KeyCode::ANSI_W,
        0x58 => KeyCode::ANSI_X,
        0x59 => KeyCode::ANSI_Y,
        0x5A => KeyCode::ANSI_Z,
        0x30 => KeyCode::ANSI_0,
        0x31 => KeyCode::ANSI_1,
        0x32 => KeyCode::ANSI_2,
        0x33 => KeyCode::ANSI_3,
        0x34 => KeyCode::ANSI_4,
        0x35 => KeyCode::ANSI_5,
        0x36 => KeyCode::ANSI_6,
        0x37 => KeyCode::ANSI_7,
        0x38 => KeyCode::ANSI_8,
        0x39 => KeyCode::ANSI_9,
        VK_BACK => KeyCode::DELETE,
        VK_TAB => KeyCode::TAB,
        VK_RETURN => KeyCode::RETURN,
        VK_ESCAPE => KeyCode::ESCAPE,
        VK_SPACE => KeyCode::SPACE,
        VK_PRIOR => KeyCode::PAGE_UP,
        VK_NEXT => KeyCode::PAGE_DOWN,
        VK_END => KeyCode::END,
        VK_HOME => KeyCode::HOME,
        VK_LEFT => KeyCode::LEFT_ARROW,
        VK_UP => KeyCode::UP_ARROW,
        VK_RIGHT => KeyCode::RIGHT_ARROW,
        VK_DOWN => KeyCode::DOWN_ARROW,
        VK_SNAPSHOT => KeyCode::F13,
        VK_INSERT => KeyCode::HELP,
        VK_DELETE => KeyCode::FORWARD_DELETE,
        VK_LWIN => KeyCode::COMMAND,
        VK_RWIN => KeyCode::RIGHT_COMMAND,
        VK_LSHIFT | VK_SHIFT => KeyCode::SHIFT,
        VK_RSHIFT => KeyCode::RIGHT_SHIFT,
        VK_LCONTROL | VK_CONTROL => KeyCode::CONTROL,
        VK_RCONTROL => KeyCode::RIGHT_CONTROL,
        VK_LMENU | VK_MENU => KeyCode::OPTION,
        VK_RMENU => KeyCode::RIGHT_OPTION,
        VK_CAPITAL => KeyCode::CAPS_LOCK,
        VK_NUMLOCK => KeyCode::ANSI_KEYPAD_CLEAR,
        VK_SCROLL => KeyCode::F14,
        VK_PAUSE => KeyCode::F15,
        VK_NUMPAD0 => KeyCode::ANSI_KEYPAD_0,
        VK_NUMPAD1 => KeyCode::ANSI_KEYPAD_1,
        VK_NUMPAD2 => KeyCode::ANSI_KEYPAD_2,
        VK_NUMPAD3 => KeyCode::ANSI_KEYPAD_3,
        VK_NUMPAD4 => KeyCode::ANSI_KEYPAD_4,
        VK_NUMPAD5 => KeyCode::ANSI_KEYPAD_5,
        VK_NUMPAD6 => KeyCode::ANSI_KEYPAD_6,
        VK_NUMPAD7 => KeyCode::ANSI_KEYPAD_7,
        VK_NUMPAD8 => KeyCode::ANSI_KEYPAD_8,
        VK_NUMPAD9 => KeyCode::ANSI_KEYPAD_9,
        VK_MULTIPLY => KeyCode::ANSI_KEYPAD_MULTIPLY,
        VK_ADD => KeyCode::ANSI_KEYPAD_PLUS,
        VK_SUBTRACT => KeyCode::ANSI_KEYPAD_MINUS,
        VK_DECIMAL => KeyCode::ANSI_KEYPAD_DECIMAL,
        VK_DIVIDE => KeyCode::ANSI_KEYPAD_DIVIDE,
        VK_OEM_1 => KeyCode::ANSI_SEMICOLON,
        VK_OEM_PLUS => KeyCode::ANSI_EQUAL,
        VK_OEM_COMMA => KeyCode::ANSI_COMMA,
        VK_OEM_MINUS => KeyCode::ANSI_MINUS,
        VK_OEM_PERIOD => KeyCode::ANSI_PERIOD,
        VK_OEM_2 => KeyCode::ANSI_SLASH,
        VK_OEM_3 => KeyCode::ANSI_GRAVE,
        VK_OEM_4 => KeyCode::ANSI_LEFT_BRACKET,
        VK_OEM_5 => KeyCode::ANSI_BACKSLASH,
        VK_OEM_6 => KeyCode::ANSI_RIGHT_BRACKET,
        VK_OEM_7 => KeyCode::ANSI_QUOTE,
        VK_OEM_102 => KeyCode::ISO_SECTION,
        value if value == VK_F1 => KeyCode::F1,
        value if value == VK_F1 + 1 => KeyCode::F2,
        value if value == VK_F1 + 2 => KeyCode::F3,
        value if value == VK_F1 + 3 => KeyCode::F4,
        value if value == VK_F1 + 4 => KeyCode::F5,
        value if value == VK_F1 + 5 => KeyCode::F6,
        value if value == VK_F1 + 6 => KeyCode::F7,
        value if value == VK_F1 + 7 => KeyCode::F8,
        value if value == VK_F1 + 8 => KeyCode::F9,
        value if value == VK_F1 + 9 => KeyCode::F10,
        value if value == VK_F1 + 10 => KeyCode::F11,
        value if value == VK_F1 + 11 => KeyCode::F12,
        value if value == VK_F1 + 12 => KeyCode::F13,
        value if value == VK_F1 + 13 => KeyCode::F14,
        value if value == VK_F1 + 14 => KeyCode::F15,
        value if value == VK_F1 + 15 => KeyCode::F16,
        value if value == VK_F1 + 16 => KeyCode::F17,
        value if value == VK_F1 + 17 => KeyCode::F18,
        value if value == VK_F1 + 18 => KeyCode::F19,
        value if value == VK_F1 + 19 => KeyCode::F20,
        _ => return None,
    };
    Some(key)
}

pub fn vk_for_mac_keycode(code: u16) -> Option<i32> {
    match code {
        KeyCode::SHIFT => return Some(VK_LSHIFT as i32),
        KeyCode::RIGHT_SHIFT => return Some(VK_RSHIFT as i32),
        KeyCode::CONTROL => return Some(VK_LCONTROL as i32),
        KeyCode::RIGHT_CONTROL => return Some(VK_RCONTROL as i32),
        KeyCode::OPTION => return Some(VK_LMENU as i32),
        KeyCode::RIGHT_OPTION => return Some(VK_RMENU as i32),
        KeyCode::COMMAND => return Some(VK_LWIN as i32),
        KeyCode::RIGHT_COMMAND => return Some(VK_RWIN as i32),
        _ => {}
    }
    for vk in 0u16..=255 {
        if mac_keycode_for_vk(vk) == Some(code) {
            return Some(vk as i32);
        }
    }
    None
}
