/*
* Blur Auto Clicker - clicker_engine.go
* Copyright (C) 2026  [Blur009]
*
* This program is free software: you can redistribute it and/or modify
* it under the terms of the GNU General Public License as published by
* the Free Software Foundation, either version 3 of the License, or
* any later version.
*
* Made with Spite. (the emotion)
*
 */

package main

import "C"
import (
	"math"
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
	procGetCursorPos = user32.NewProc("GetCursorPos")

	winmm            = syscall.NewLazyDLL("winmm.dll")
	procTimeBeginPer = winmm.NewProc("timeBeginPeriod")
	procTimeEndPer   = winmm.NewProc("timeEndPeriod")
)

type POINT struct {
	X int32
	Y int32
}

var isRunning atomic.Bool
var inputBuffer = make([]Input, 100)

func getCursorPos() (int32, int32) {
	var pt POINT
	procGetCursorPos.Call(uintptr(unsafe.Pointer(&pt)))
	return pt.X, pt.Y
}

func moveMouse(x, y int32) {
	procSetCursorPos.Call(uintptr(x), uintptr(y))
}

func cubicBezier(t, p0, p1, p2, p3 float64) float64 {
	u := 1 - t
	return u*u*u*p0 + 3*u*u*t*p1 + 3*u*t*t*p2 + t*t*t*p3
}

func easeInOutQuad(t float64) float64 {
	if t < 0.5 {
		return 2 * t * t
	}
	return 1 - math.Pow(-2*t+2, 2)/2
}

func smoothMove(startX, startY, endX, endY int32, durationMs int, r *rand.Rand) {
	if durationMs < 5 {
		moveMouse(endX, endY)
		return
	}

	sx, sy := float64(startX), float64(startY)
	ex, ey := float64(endX), float64(endY)
	dx, dy := ex-sx, ey-sy
	distance := math.Sqrt(dx*dx + dy*dy)

	if distance < 1 {
		return
	}

	perpX, perpY := -dy/distance, dx/distance
	offset1 := (r.Float64()*0.3 + 0.15) * distance
	offset2 := (r.Float64()*0.3 + 0.15) * distance
	if r.Float64() < 0.5 {
		offset1 = -offset1
	}
	if r.Float64() < 0.5 {
		offset2 = -offset2
	}

	cp1x, cp1y := sx+dx*0.33+perpX*offset1, sy+dy*0.33+perpY*offset1
	cp2x, cp2y := sx+dx*0.66+perpX*offset2, sy+dy*0.66+perpY*offset2

	steps := durationMs
	if steps > 200 {
		steps = 200
	}
	if steps < 10 {
		steps = 10
	}

	stepTime := time.Duration(durationMs/steps) * time.Millisecond

	for i := 0; i <= steps; i++ {
		t := easeInOutQuad(float64(i) / float64(steps))
		x := cubicBezier(t, sx, cp1x, cp2x, ex)
		y := cubicBezier(t, sy, cp1y, cp2y, ey)
		moveMouse(int32(x), int32(y))
		if i < steps {
			time.Sleep(stepTime)
		}
	}
}

func sendBatch(downFlag, upFlag uint32, n int, holdMs uint32) {
	for i := 0; i < n; i++ {
		inputBuffer[i*2] = Input{Type: INPUT_MOUSE, Mi: MouseInput{DwFlags: downFlag, Time: 0}}
		inputBuffer[i*2+1] = Input{Type: INPUT_MOUSE, Mi: MouseInput{DwFlags: upFlag, Time: holdMs}}
	}
	procSendInput.Call(uintptr(n*2), uintptr(unsafe.Pointer(&inputBuffer[0])), unsafe.Sizeof(inputBuffer[0]))
}

func sendMouseEvent(flags uint32) {
	var singleInput = Input{Type: INPUT_MOUSE, Mi: MouseInput{DwFlags: flags}}
	procSendInput.Call(uintptr(1), uintptr(unsafe.Pointer(&singleInput)), unsafe.Sizeof(singleInput))
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
	offset_chance C.double,
	smoothing C.int,
) {
	isRunning.Store(true)
	procTimeBeginPer.Call(1)
	defer procTimeEndPer.Call(1)

	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	clickCount := 0
	startTime := time.Now()
	intervalF := float64(interval)
	downFlag, upFlag := getButtonFlags(int(button))

	cps := 0.0
	if intervalF > 0 {
		cps = 1.0 / intervalF
	}

	batchSize := 1
	if cps >= 200 {
		batchSize = 5
	} else if cps >= 100 {
		batchSize = 2
	}

	useBatching := batchSize > 1
	batchInterval := intervalF * float64(batchSize)
	holdMs := uint32((intervalF * (float64(duty) / 100.0)) * 1000)
	useSmoothing := int(smoothing) == 1 && cps < 50

	hasPosition := int(posX) != 0 || int(posY) != 0

	targetX, targetY := int32(posX), int32(posY)
	if hasPosition {
		moveMouse(targetX, targetY)
	}

	nextBatchTime := time.Now()

	for isRunning.Load() {
		if (limit > 0 && clickCount >= int(limit)) || (timeLimit > 0 && time.Since(startTime).Seconds() >= float64(timeLimit)) {
			break
		}

		batchDuration := batchInterval
		if variation > 0 {
			vFactor := 1.0 + (r.Float64()*2-1)*(float64(variation)/100.0)
			batchDuration = batchInterval * vFactor
		}

		nextBatchTime = nextBatchTime.Add(time.Duration(batchDuration * float64(time.Second)))

		if hasPosition {
			if float64(offset_chance) <= 0 || r.Float64()*100 <= float64(offset_chance) {
				angle := r.Float64() * 2 * math.Pi
				radius := math.Sqrt(r.Float64()) * float64(offset)

				targetX = int32(float64(posX) + radius*math.Cos(angle))
				targetY = int32(float64(posY) + radius*math.Sin(angle))
			}

			curX, curY := getCursorPos()
			if curX != targetX || curY != targetY {
				if useSmoothing {
					smoothDur := int((batchDuration * (0.2 + r.Float64()*0.4)) * 1000)
					if smoothDur > 200 {
						smoothDur = 200
					}
					if smoothDur < 15 {
						smoothDur = 15
					}
					smoothMove(curX, curY, targetX, targetY, smoothDur, r)
				} else {
					moveMouse(targetX, targetY)
				}
			}
		}

		if useBatching {
			sendBatch(downFlag, upFlag, batchSize, holdMs)
		} else {
			sendMouseEvent(downFlag)
			if holdMs > 0 {
				time.Sleep(time.Duration(holdMs) * time.Millisecond)
			}
			sendMouseEvent(upFlag)
		}

		clickCount += batchSize

		remaining := time.Until(nextBatchTime)
		if cps < 100 && remaining > 2*time.Millisecond {
			time.Sleep(remaining - 1*time.Millisecond)
		}
		for time.Now().Before(nextBatchTime) {
		}
	}
}

//export stop_clicker
func stop_clicker() { isRunning.Store(false) }

func main() {}
