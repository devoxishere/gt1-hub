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
import android.os.Build;
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
    private boolean isReceiverRegistered = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        usbManager = (UsbManager) getSystemService(Context.USB_SERVICE);

        final WebView webView = getBridge().getWebView();
        webView.addJavascriptInterface(new NativeBridge(), "NativeUSB");
    }

    public class NativeBridge {
        @JavascriptInterface
        public void connect() {
            sendToJS("Searching for Roland/BOSS devices...");
            
            HashMap<String, UsbDevice> deviceList = usbManager.getDeviceList();
            targetDevice = null;
            for (UsbDevice device : deviceList.values()) {
                if (device.getVendorId() == 1410 || device.getVendorId() == 0x0582) {
                    targetDevice = device;
                    break;
                }
            }

            if (targetDevice != null) {
                if (usbManager.hasPermission(targetDevice)) {
                    sendToJS("Permission already granted. Setting up...");
                    setupUsb(targetDevice);
                } else {
                    sendToJS("Requesting system permission...");
                    requestPermission();
                }
            } else {
                sendToJS("No BOSS GT-1 found. Check OTG/Cable.");
            }
        }

        @JavascriptInterface
        public void sendProgramChange(int patch) {
            if (usbConnection == null || outEndpoint == null) return;
            byte[] packet = new byte[]{0x0C, (byte) 0xC0, (byte) (patch - 1), 0x00};
            usbConnection.bulkTransfer(outEndpoint, packet, packet.length, 500);
        }
    }

    private void requestPermission() {
        // Register receiver BEFORE requesting permission
        if (!isReceiverRegistered) {
            IntentFilter filter = new IntentFilter(ACTION_USB_PERMISSION);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(usbReceiver, filter, Context.RECEIVER_EXPORTED);
            } else {
                registerReceiver(usbReceiver, filter);
            }
            isReceiverRegistered = true;
        }

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags |= PendingIntent.FLAG_MUTABLE;
        }
        
        PendingIntent permissionIntent = PendingIntent.getBroadcast(this, 0, new Intent(ACTION_USB_PERMISSION), flags);
        usbManager.requestPermission(targetDevice, permissionIntent);
    }

    private final BroadcastReceiver usbReceiver = new BroadcastReceiver() {
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            if (ACTION_USB_PERMISSION.equals(action)) {
                synchronized (this) {
                    UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                    if (intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
                        if (device != null) setupUsb(device);
                    } else {
                        sendToJS("PERMISSION DENIED");
                    }
                }
            }
        }
    };

    private void setupUsb(UsbDevice device) {
        boolean foundEp = false;
        for (int i = 0; i < device.getInterfaceCount(); i++) {
            UsbInterface itf = device.getInterface(i);
            for (int j = 0; j < itf.getEndpointCount(); j++) {
                UsbEndpoint ep = itf.getEndpoint(j);
                if (ep.getDirection() == UsbConstants.USB_DIR_OUT) {
                    usbInterface = itf;
                    outEndpoint = ep;
                    foundEp = true;
                    break;
                }
            }
            if (foundEp) break;
        }

        usbConnection = usbManager.openDevice(device);
        if (usbConnection != null && usbConnection.claimInterface(usbInterface, true)) {
            sendToJS("NATIVE_CONNECTED: BOSS GT-1 ready.");
        } else {
            sendToJS("Failed to claim USB interface.");
        }
    }

    private void sendToJS(final String msg) {
        runOnUiThread(() -> {
            getBridge().getWebView().evaluateJavascript("if(window.app) window.app.log('Native: " + msg + "')", null);
        });
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (isReceiverRegistered) {
            unregisterReceiver(usbReceiver);
            isReceiverRegistered = false;
        }
    }
}
