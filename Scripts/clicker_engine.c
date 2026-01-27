#include <windows.h>
#include <math.h>
#include <stdio.h>
#include <time.h>

volatile int is_running = 0;

// --- MATH HELPERS ---
double get_random(double min, double max) {
    double range = max - min;
    double div = RAND_MAX / range;
    return min + (rand() / div);
}

// --- MOUSE FUNCTIONS ---
void __stdcall move_mouse(int x, int y) {
    SetCursorPos(x, y);
}

void __stdcall mouse_down(int button) {
    INPUT input = {0};
    input.type = INPUT_MOUSE;
    if (button == 1) input.mi.dwFlags = MOUSEEVENTF_LEFTDOWN;
    else if (button == 2) input.mi.dwFlags = MOUSEEVENTF_RIGHTDOWN;
    else input.mi.dwFlags = MOUSEEVENTF_MIDDLEDOWN;
    SendInput(1, &input, sizeof(INPUT));
}

void __stdcall mouse_up(int button) {
    INPUT input = {0};
    input.type = INPUT_MOUSE;
    if (button == 1) input.mi.dwFlags = MOUSEEVENTF_LEFTUP;
    else if (button == 2) input.mi.dwFlags = MOUSEEVENTF_RIGHTUP;
    else input.mi.dwFlags = MOUSEEVENTF_MIDDLEUP;
    SendInput(1, &input, sizeof(INPUT));
}

// --- CONTROL FUNCTIONS ---
void __stdcall stop_clicker() {
    is_running = 0;
}

// --- MAIN LOOP V3 (Clean & Timer Boosted) ---
void __stdcall start_clicker(double click_interval, double click_variation, int click_limit,
                             double click_duty_cycle, double click_time_limit, int click_button,
                             int click_position_x, int click_position_y, double click_position_offset) {

    if (click_interval <= 0) return;

    is_running = 1;
    srand((unsigned int)time(NULL));

    // --- THE MAGIC SAUCE ---
    // Increase Windows Timer Resolution to 1ms.
    // This prevents Sleep(100) from turning into Sleep(106) or Sleep(115).
    timeBeginPeriod(1);

    int click_counter = 0;
    LARGE_INTEGER frequency, start_time, current_time;
    QueryPerformanceFrequency(&frequency);
    QueryPerformanceCounter(&start_time);

    double var_amount = click_interval * (click_variation / 100.0);
    double min_int = click_interval - var_amount;
    double max_int = click_interval + var_amount;

    while (is_running) {
        // 1. LIMIT CHECKS
        if (click_limit > 0 && click_counter >= click_limit) break;
        if (click_time_limit > 0) {
            QueryPerformanceCounter(&current_time);
            if ((current_time.QuadPart - start_time.QuadPart) / (double)frequency.QuadPart >= click_time_limit) break;
        }

        // 2. MOUSE POSITION
        if (click_position_x != 0 || click_position_y != 0) {
            move_mouse(
                (int)(click_position_x + get_random(-click_position_offset, click_position_offset)),
                (int)(click_position_y + get_random(-click_position_offset, click_position_offset))
            );
        }

        // 3. TIMING & CLICKING
        LARGE_INTEGER loop_start, loop_end;
        QueryPerformanceCounter(&loop_start);

        double target_duration = get_random(min_int, max_int);
        double hold_duration = target_duration * (click_duty_cycle / 100.0);

        mouse_down(click_button);
        if (hold_duration > 0) Sleep((DWORD)(hold_duration * 1000));
        mouse_up(click_button);

        click_counter++;

        // 4. SLEEP
        QueryPerformanceCounter(&loop_end);
        double elapsed = (loop_end.QuadPart - loop_start.QuadPart) / (double)frequency.QuadPart;
        double sleep_needed = target_duration - elapsed;

        if (sleep_needed > 0) {
            Sleep((DWORD)(sleep_needed * 1000));
        }
    }

    // Restore default timer resolution when done
    timeEndPeriod(1);
}