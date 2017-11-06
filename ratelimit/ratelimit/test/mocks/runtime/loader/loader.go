// Automatically generated by MockGen. DO NOT EDIT!
// Source: github.com/lyft/goruntime/loader (interfaces: IFace)

package mock_loader

import (
	gomock "github.com/golang/mock/gomock"
	snapshot "github.com/lyft/goruntime/snapshot"
)

// Mock of IFace interface
type MockIFace struct {
	ctrl     *gomock.Controller
	recorder *_MockIFaceRecorder
}

// Recorder for MockIFace (not exported)
type _MockIFaceRecorder struct {
	mock *MockIFace
}

func NewMockIFace(ctrl *gomock.Controller) *MockIFace {
	mock := &MockIFace{ctrl: ctrl}
	mock.recorder = &_MockIFaceRecorder{mock}
	return mock
}

func (_m *MockIFace) EXPECT() *_MockIFaceRecorder {
	return _m.recorder
}

func (_m *MockIFace) AddUpdateCallback(_param0 chan<- int) {
	_m.ctrl.Call(_m, "AddUpdateCallback", _param0)
}

func (_mr *_MockIFaceRecorder) AddUpdateCallback(arg0 interface{}) *gomock.Call {
	return _mr.mock.ctrl.RecordCall(_mr.mock, "AddUpdateCallback", arg0)
}

func (_m *MockIFace) Snapshot() snapshot.IFace {
	ret := _m.ctrl.Call(_m, "Snapshot")
	ret0, _ := ret[0].(snapshot.IFace)
	return ret0
}

func (_mr *_MockIFaceRecorder) Snapshot() *gomock.Call {
	return _mr.mock.ctrl.RecordCall(_mr.mock, "Snapshot")
}
