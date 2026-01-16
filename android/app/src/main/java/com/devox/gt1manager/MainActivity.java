package com.devox.gt1manager;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Bundle;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import java.util.HashMap;

public class MainActivity extends BridgeActivity {
    private static final String ACTION_USB_PERMISSION = "com.devox.gt1manager.USB_PERMISSION";
    private UsbManager usbManager;
    private UsbDevice targetDevice;
    private UsbDeviceConnection usbConnection;
    private UsbEndpoint outEndpoint;
    private UsbInterface usbInterface;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        usbManager = (UsbManager) getSystemService(Context.USB_SERVICE);

        // Register JS Bridge
        final WebView webView = getBridge().getWebView();
        webView.addJavascriptInterface(new NativeBridge(), "NativeUSB");
    }

    public class NativeBridge {
        @JavascriptInterface
        public void connect() {
            Log.d("GT1_NATIVE", "Connect requested from JS");
            HashMap<String, UsbDevice> deviceList = usbManager.getDeviceList();
            for (UsbDevice device : deviceList.values()) {
                // Boss/Roland Vendor ID = 1410 (0x0582)
                if (device.getVendorId() == 1410) {
                    targetDevice = device;
                    requestPermission();
                    return;
                }
            }
            sendToJS("No BOSS GT-1 found in USB list.");
        }

        @JavascriptInterface
        public void sendProgramChange(int patch) {
            if (usbConnection == null || outEndpoint == null) {
                sendToJS("Error: USB not connected or permission denied");
                return;
            }

            // MIDI Program Change: 0xC0, 0xXX
            // Boss GT-1 USB Packet format: 0x0C (MIDI header for Program Change), 0xC0, patch, 0x00
            byte[] packet = new byte[]{0x0C, (byte) 0xC0, (byte) (patch - 1), 0x00};
            
            int result = usbConnection.bulkTransfer(outEndpoint, packet, packet.length, 1000);
            if (result >= 0) {
                Log.d("GT1_NATIVE", "Sent patch " + patch);
            } else {
                sendToJS("USB Transfer failed: " + result);
            }
        }
    }

    private void requestPermission() {
        PendingIntent permissionIntent = PendingIntent.getBroadcast(this, 0, new Intent(ACTION_USB_PERMISSION), PendingIntent.FLAG_IMMUTABLE);
        IntentFilter filter = new IntentFilter(ACTION_USB_PERMISSION);
        registerReceiver(usbReceiver, filter);
        usbManager.requestPermission(targetDevice, permissionIntent);
    }

    private final BroadcastReceiver usbReceiver = new BroadcastReceiver() {
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            if (ACTION_USB_PERMISSION.equals(action)) {
                synchronized (this) {
                    UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                    if (intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
                        if (device != null) {
                            setupUsb(device);
                        }
                    } else {
                        sendToJS("USB Permission denied by user");
                    }
                }
            }
        }
    };

    private void setupUsb(UsbDevice device) {
        usbInterface = device.getInterface(0); // Usually 0 or 1 for MIDI
        for (int i = 0; i < device.getInterfaceCount(); i++) {
            UsbInterface itf = device.getInterface(i);
            for (int j = 0; j < itf.getEndpointCount(); j++) {
                UsbEndpoint ep = itf.getEndpoint(j);
                if (ep.getDirection() == UsbConstants.USB_DIR_OUT) {
                    usbInterface = itf;
                    outEndpoint = ep;
                    break;
                }
            }
        }

        usbConnection = usbManager.openDevice(device);
        if (usbConnection != null && usbConnection.claimInterface(usbInterface, true)) {
            sendToJS("CONNECTED_NATIVE");
        } else {
            sendToJS("Failed to claim interface");
        }
    }

    private void sendToJS(final String msg) {
        runOnUiThread(() -> {
            getBridge().getWebView().evaluateJavascript("if(window.app) window.app.log('Native: " + msg + "')", null);
        });
    }
}
