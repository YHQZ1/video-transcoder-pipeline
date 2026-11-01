import jenkins.model.Jenkins
import hudson.security.*

// Require login: no anonymous access. Password comes from the environment, never hard-coded.
def pw = System.getenv('JENKINS_ADMIN_PASSWORD')
if (!pw) { throw new IllegalStateException('JENKINS_ADMIN_PASSWORD is not set') }
def j = Jenkins.get()
def realm = new HudsonPrivateSecurityRealm(false)
realm.createAccount('admin', pw)
j.setSecurityRealm(realm)
def strategy = new FullControlOnceLoggedInAuthorizationStrategy()
strategy.setAllowAnonymousRead(false)
j.setAuthorizationStrategy(strategy)
j.save()
