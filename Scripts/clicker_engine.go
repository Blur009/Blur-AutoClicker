package main

import "C"
import (
	"math/rand"
	"sync/atomic"
	"syscall"
	"time"
	"unsafe"
)

const (
	INPUT_MOUSE            = 0
	MOUSEEVENTF_LEFTDOWN   = 0x0002
	MOUSEEVENTF_LEFTUP     = 0x0004
	MOUSEEVENTF_RIGHTDOWN  = 0x0008
	MOUSEEVENTF_RIGHTUP    = 0x0010
	MOUSEEVENTF_MIDDLEDOWN = 0x0020
	MOUSEEVENTF_MIDDLEUP   = 0x0040
)

type MouseInput struct {
	Dx          int32
	Dy          int32
	MouseData   uint32
	DwFlags     uint32
	Time        uint32
	DwExtraInfo uintptr
}
type Input struct {
	Type uint32
	_    uint32
	Mi   MouseInput
}

var (
	user32           = syscall.NewLazyDLL("user32.dll")
	procSetCursorPos = user32.NewProc("SetCursorPos")
	procSendInput    = user32.NewProc("SendInput")

	winmm            = syscall.NewLazyDLL("winmm.dll")
	procTimeBeginPer = winmm.NewProc("timeBeginPeriod")
	procTimeEndPer   = winmm.NewProc("timeEndPeriod")
)

var isRunning atomic.Bool

func moveMouse(x, y int32) {
	procSetCursorPos.Call(uintptr(x), uintptr(y))
}

func sendMouseEvent(flags uint32) {
	input := Input{
		Type: INPUT_MOUSE,
		Mi: MouseInput{
			DwFlags: flags,
		},
	}

	procSendInput.Call(
		uintptr(1),
		uintptr(unsafe.Pointer(&input)),
		unsafe.Sizeof(input),
	)
}

func getButtonFlags(button int) (downFlag, upFlag uint32) {
	switch button {
	case 2:
		return MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP
	case 3:
		return MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP
	default:
		return MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP
	}
}

//export start_clicker
func start_clicker(
	interval C.double,
	variation C.double,
	limit C.int,
	duty C.double,
	timeLimit C.double,
	button C.int,
	posX C.int,
	posY C.int,
	offset C.double,
) {
	isRunning.Store(true)

	procTimeBeginPer.Call(1)
	defer procTimeEndPer.Call(1)

	clickCount := 0
	startTime := time.Now()
	r := rand.New(rand.NewSource(time.Now().UnixNano()))

	// Pre-compute constants
	hasPosition := int(posX) != 0 || int(posY) != 0
	offsetVal := float64(offset)
	hasOffset := offsetVal > 0
	variation100 := float64(variation) / 100.0
	downFlag, upFlag := getButtonFlags(int(button))

	for isRunning.Load() {

		if limit > 0 && clickCount >= int(limit) {
			break
		}
		if timeLimit > 0 && time.Since(startTime).Seconds() >= float64(timeLimit) {
			break
		}

		// Calculate target time BEFORE executing the click
		varMin := float64(interval) * (1.0 - variation100)
		varMax := float64(interval) * (1.0 + variation100)
		targetDuration := r.Float64()*(varMax-varMin) + varMin
		holdDuration := targetDuration * (float64(duty) / 100.0)
		targetEndTime := time.Now().Add(time.Duration(targetDuration * float64(time.Second)))

		if hasPosition {
			var randOffX, randOffY float64
			if hasOffset {
				randOffX = (r.Float64() * 2 * offsetVal) - offsetVal
				randOffY = (r.Float64() * 2 * offsetVal) - offsetVal
			}
			moveMouse(int32(float64(posX)+randOffX), int32(float64(posY)+randOffY))
		}

		sendMouseEvent(downFlag)

		if holdDuration > 0 {
			time.Sleep(time.Duration(holdDuration * float64(time.Second)))
		}

		sendMouseEvent(upFlag)
		clickCount++

		// Sleep until target time with tight polling for last millisecond
		for time.Now().Before(targetEndTime) {
			waitDuration := time.Until(targetEndTime)
			if waitDuration > time.Millisecond {
				time.Sleep(waitDuration / 2) // Sleep half remaining to avoid overshooting
			}
		}
	}
}

//export stop_clicker
func stop_clicker() {
	isRunning.Store(false)
}

func main() {}
