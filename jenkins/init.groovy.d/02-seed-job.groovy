import jenkins.model.Jenkins
import org.jenkinsci.plugins.workflow.job.WorkflowJob
import org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition

def j = Jenkins.get()
def name = 'video-encoder-pipeline'
if (j.getItem(name) == null) {
    def script = new File('/usr/share/jenkins/ref/Jenkinsfile').text
    def job = j.createProject(WorkflowJob, name)
    job.setDefinition(new CpsFlowDefinition(script, true))
    job.save()
}
