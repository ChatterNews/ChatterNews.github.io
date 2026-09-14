#import <AppKit/AppKit.h>

// A native Finder launcher. All app code is in the adjacent signed bundle;
// no shell commands, browser server, or caller-supplied arguments are used.
@interface OrbitLauncher : NSObject <NSApplicationDelegate>
@end

@implementation OrbitLauncher
- (NSURL *)runtimeAtRoot:(NSURL *)root {
    return [root URLByAppendingPathComponent:@"_Orbit/runtime/Orbit.app" isDirectory:YES];
}
- (BOOL)isOrbitRoot:(NSURL *)root {
    NSURL *runtime = [self runtimeAtRoot:root];
    NSURL *index = [runtime URLByAppendingPathComponent:@"Contents/Resources/app/web/index.html"];
    return [[NSFileManager defaultManager] fileExistsAtPath:index.path];
}
- (void)showError:(NSString *)message {
    [NSApp activateIgnoringOtherApps:YES];
    NSAlert *alert = [[NSAlert alloc] init];
    alert.alertStyle = NSAlertStyleWarning;
    alert.messageText = @"Orbit could not open";
    alert.informativeText = message;
    [alert addButtonWithTitle:@"OK"];
    [alert runModal];
    [NSApp terminate:nil];
}
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    (void)notification;
    NSURL *root = [[[NSBundle mainBundle] bundleURL] URLByDeletingLastPathComponent];
    if (![self isOrbitRoot:root]) {
        // Gatekeeper may run a newly downloaded app from an isolated location.
        // Reconnect with a user-selected folder instead of changing OS policy.
        [NSApp activateIgnoringOtherApps:YES];
        NSOpenPanel *panel = [NSOpenPanel openPanel];
        panel.title = @"Choose your Orbit folder";
        panel.message = @"Choose the extracted Orbit folder that contains Start Orbit, Chatter News, and _Orbit. Keep the whole folder together.";
        panel.prompt = @"Open Orbit";
        panel.canChooseDirectories = YES;
        panel.canChooseFiles = NO;
        panel.canCreateDirectories = NO;
        panel.allowsMultipleSelection = NO;
        if ([panel runModal] != NSModalResponseOK) { [NSApp terminate:nil]; return; }
        root = panel.URL;
        if (![self isOrbitRoot:root]) {
            [self showError:@"That folder does not contain the complete Orbit app. Download the ZIP and extract all of it, then open Start Orbit inside the extracted folder."];
            return;
        }
    }
    NSError *error = nil;
    NSURL *work = [root URLByAppendingPathComponent:@"Chatter News" isDirectory:YES];
    if (![[NSFileManager defaultManager] createDirectoryAtURL:work withIntermediateDirectories:YES attributes:nil error:&error]) {
        [self showError:[@"Orbit could not open the Chatter News folder. Put the extracted Orbit folder somewhere you can save files, or reconnect the USB drive.\n\n" stringByAppendingString:error.localizedDescription]];
        return;
    }
    NSURL *support = [root URLByAppendingPathComponent:@"_Orbit" isDirectory:YES];
    [support setResourceValue:@YES forKey:NSURLIsHiddenKey error:NULL];
    NSMutableDictionary<NSString *, NSString *> *environment = [[[NSProcessInfo processInfo] environment] mutableCopy];
    for (NSString *key in [environment.allKeys copy]) {
        if ([key hasPrefix:@"ELECTRON_"] || [key isEqualToString:@"NODE_OPTIONS"]) [environment removeObjectForKey:key];
    }
    environment[@"ORBIT_PORTABLE_ROOT"] = root.path;
    NSWorkspaceOpenConfiguration *configuration = [NSWorkspaceOpenConfiguration configuration];
    configuration.environment = environment;
    configuration.arguments = @[];
    configuration.activates = YES;
    configuration.createsNewApplicationInstance = YES;
    [[NSWorkspace sharedWorkspace] openApplicationAtURL:[self runtimeAtRoot:root] configuration:configuration completionHandler:^(NSRunningApplication *application, NSError *launchError) {
        (void)application;
        dispatch_async(dispatch_get_main_queue(), ^{
            if (launchError) [self showError:[@"macOS could not start Orbit. This pilot requires macOS 13 or newer. Keep the complete extracted Orbit folder together.\n\n" stringByAppendingString:launchError.localizedDescription]];
            else [NSApp terminate:nil];
        });
    }];
}
@end

int main(int argc, const char *argv[]) {
    (void)argc; (void)argv;
    @autoreleasepool {
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
        __attribute__((objc_precise_lifetime)) OrbitLauncher *delegate = [[OrbitLauncher alloc] init];
        NSApp.delegate = delegate;
        [NSApp run];
    }
    return 0;
}
