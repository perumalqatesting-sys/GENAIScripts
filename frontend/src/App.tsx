import { useState } from 'react'
import { generateTests } from './api'
import { GenerateRequest, GenerateResponse, TestCase } from './types'
import JiraConnector from './components/JiraConnector'
import JiraDropdown from './components/JiraDropdown'
import JiraDetailsCard from './components/JiraDetailsCard'
import { getStories, getStoryDetails } from './api/jira'
import './styles/jira.css'

function App() {
  const [selectedStory, setSelectedStory] = useState<any | null>(null);
  const [expandedTestCases, setExpandedTestCases] = useState<Set<string>>(new Set());

  const toggleTestCaseExpansion = (testCaseId: string) => {
    const newExpanded = new Set(expandedTestCases);
    if (newExpanded.has(testCaseId)) {
      newExpanded.delete(testCaseId);
    } else {
      newExpanded.add(testCaseId);
    }
    setExpandedTestCases(newExpanded);
  };

  // Testdata generator state
  const [testdata, setTestdata] = useState<any[]>([]);
  const [loadingTestdata, setLoadingTestdata] = useState(false);
  const [testdataError, setTestdataError] = useState<string | null>(null);
  const [mockarooApiKey, setMockarooApiKey] = useState<string>("");

  // Handler for Mockaroo Testdata generation
  const handleGenerateTestdata = async () => {
    if (!mockarooApiKey.trim()) {
      setTestdataError("Please enter your Mockaroo API key.");
      return;
    }
    setLoadingTestdata(true);
    setTestdataError(null);
    try {
      const schema = [
        { name: "id", type: "Row Number" },
        { name: "firstname", type: "First Name" },
        { name: "lastname", type: "Last Name" },
        { name: "email", type: "Email Address" },
        { name: "gender", type: "Gender" },
        { name: "ssn", type: "SSN" }
      ];
      const response = await fetch(
        `https://api.mockaroo.com/api/generate.json?key=${mockarooApiKey}&count=50`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(schema)
        }
      );
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to fetch testdata");
      }
      const data = await response.json();
      setTestdata(data);
    } catch (err: any) {
      setTestdataError(err.message || "Error generating testdata");
    } finally {
      setLoadingTestdata(false);
    }
  };

  const handleInputChange = (field: keyof GenerateRequest, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.storyTitle.trim() || !formData.acceptanceCriteria.trim()) {
      setError('Story Title and Acceptance Criteria are required');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await generateTests(formData);
      setResults(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate tests');
    } finally {
      setIsLoading(false);
    }
  };

  async function loadStories() {
    setStoriesError(null);
    setLoadingStories(true);
    try {
      const data = await getStories();
      setStories(data || []);
    } catch (err: any) {
      setStoriesError(err?.response?.data?.message || err.message || 'Failed to load stories');
    } finally {
      setLoadingStories(false);
    }
  }

  async function handleLinkStory(key: string) {
    setSelectedStory(null);
    try {
      const details = await getStoryDetails(key);
      setSelectedStory(details);
      if (details.title) handleInputChange('storyTitle', details.title);
      if (details.description) handleInputChange('description', details.description);
      if (details.acceptanceCriteria) handleInputChange('acceptanceCriteria', details.acceptanceCriteria);
    } catch (err: any) {
      setSelectedStory({ title: 'Error', description: `<p>${err.message}</p>` });
    }
  }

  // Expand/collapse state for testdata
  const [showTestdata, setShowTestdata] = useState(false);
  const [formData, setFormData] = useState<GenerateRequest>({
    storyTitle: '',
    acceptanceCriteria: '',
    description: '',
    additionalInfo: ''
  })
  const [results, setResults] = useState<GenerateResponse | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [stories, setStories] = useState<any[]>([])
  const [loadingStories, setLoadingStories] = useState(false)
  const [storiesError, setStoriesError] = useState<string | null>(null)

  return (
    <div className="container">
      <div className="header">
        <h1 className="title">User Story to Tests</h1>
        <p className="subtitle">Generate comprehensive test cases from your user stories</p>
      </div>

      {/* Testdata generator controls */}
      <div className="form-container" style={{ marginBottom: 24 }}>
        <div className="form-group">
          <label htmlFor="mockarooApiKey" className="form-label">Mockaroo API Key</label>
          <input
            type="text"
            id="mockarooApiKey"
            className="form-input"
            value={mockarooApiKey}
            onChange={e => setMockarooApiKey(e.target.value)}
            placeholder="Enter your Mockaroo API key..."
            style={{ marginBottom: 12 }}
          />
        </div>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            await handleGenerateTestdata();
            setShowTestdata(true);
          }}
          disabled={loadingTestdata}
        >
          {loadingTestdata ? 'Generating Testdata...' : 'Generate Testdata'}
        </button>

        {testdata.length > 0 && !loadingTestdata && (
          <button
            type="button"
            className="btn"
            style={{ marginTop: 12 }}
            onClick={() => setShowTestdata((prev) => !prev)}
          >
            {showTestdata ? 'Hide Testdata' : 'Show Testdata'}
          </button>
        )}

        {testdataError && (
          <div className="error-banner">{testdataError}</div>
        )}

        {loadingTestdata && (
          <div className="loading">Generating testdata...</div>
        )}

        {testdata.length > 0 && showTestdata && (
          <div className="results-container" style={{ marginTop: 24 }}>
            <div className="results-header">
              <h2 className="results-title">Generated Testdata (Mockaroo)</h2>
              <div className="results-meta">{testdata.length} record(s) generated</div>
            </div>
            <div className="table-container">
              <table className="results-table">
                <thead>
                  <tr>
                    {Object.keys(testdata[0]).map((key) => (
                      <th key={key}>{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {testdata.map((row, idx) => (
                    <tr key={idx}>
                      {Object.values(row).map((val, i) => (
                        <td key={i}>{String(val)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Jira integration form */}
      <form onSubmit={handleSubmit} className="form-container">
        <div className="jira-controls" style={{ marginBottom: 12 }}>
          <JiraConnector onConnected={loadStories} />
          <JiraDropdown stories={stories} loading={loadingStories} error={storiesError || undefined} onLink={handleLinkStory} />
        </div>

        {selectedStory && <JiraDetailsCard story={selectedStory} />}

        <div className="form-group">
          <label htmlFor="storyTitle" className="form-label">Story Title *</label>
          <input
            type="text"
            id="storyTitle"
            className="form-input"
            value={formData.storyTitle}
            onChange={(e) => handleInputChange('storyTitle', e.target.value)}
            placeholder="Enter the user story title..."
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="description" className="form-label">Description</label>
          <textarea
            id="description"
            className="form-textarea"
            value={formData.description}
            onChange={(e) => handleInputChange('description', e.target.value)}
            placeholder="Additional description (optional)..."
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="acceptanceCriteria" className="form-label">Acceptance Criteria *</label>
          <textarea
            id="acceptanceCriteria"
            className="form-textarea"
            value={formData.acceptanceCriteria}
            onChange={(e) => handleInputChange('acceptanceCriteria', e.target.value)}
            placeholder="Enter the acceptance criteria..."
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="additionalInfo" className="form-label">Additional Info</label>
          <textarea
            id="additionalInfo"
            className="form-textarea"
            value={formData.additionalInfo}
            onChange={(e) => handleInputChange('additionalInfo', e.target.value)}
            placeholder="Any additional information (optional)..."
          />
        </div>
        
        <button
          type="submit"
          className="btn"
          disabled={isLoading}
        >
          {isLoading ? 'Generating...' : 'Generate'}
        </button>
      </form>

      {error && (
        <div className="error-banner">{error}</div>
      )}

      {isLoading && (
        <div className="loading">Generating test cases...</div>
      )}

      {results && (
        <div className="results-container">
          <div className="results-header">
            <h2 className="results-title">Generated Test Cases</h2>
            <div className="results-meta">
              {results.cases.length} test case(s) generated
              {results.model && ` • Model: ${results.model}`}
              {results.promptTokens > 0 && ` • Tokens: ${results.promptTokens + results.completionTokens}`}
            </div>
          </div>
          <div className="table-container">
            <table className="results-table">
              <thead>
                <tr>
                  <th>Test Case ID</th>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Expected Result</th>
                </tr>
              </thead>
              <tbody>
                {results.cases.map((testCase: TestCase) => (
                  <>
                    <tr key={testCase.id}>
                      <td>
                        <div 
                          className={`test-case-id ${expandedTestCases.has(testCase.id) ? 'expanded' : ''}`}
                          onClick={() => toggleTestCaseExpansion(testCase.id)}
                        >
                          <span className={`expand-icon ${expandedTestCases.has(testCase.id) ? 'expanded' : ''}`}>
                            ▶
                          </span>
                          {testCase.id}
                        </div>
                      </td>
                      <td>{testCase.title}</td>
                      <td>
                        <span className={`category-${testCase.category.toLowerCase()}`}>
                          {testCase.category}
                        </span>
                      </td>
                      <td>{testCase.expectedResult}</td>
                    </tr>
                    {expandedTestCases.has(testCase.id) && (
                      <tr key={`${testCase.id}-details`}>
                        <td colSpan={4}>
                          <div className="expanded-details">
                            <h4 style={{marginBottom: '15px', color: '#2c3e50'}}>Test Steps for {testCase.id}</h4>
                            <div className="step-labels">
                              <div>Step ID</div>
                              <div>Step Description</div>
                              <div>Test Data</div>
                              <div>Expected Result</div>
                            </div>
                            {testCase.steps.map((step, index) => (
                              <div key={index} className="step-item">
                                <div className="step-header">
                                  <div className="step-id">S{String(index + 1).padStart(2, '0')}</div>
                                  <div className="step-description">{step}</div>
                                  <div className="step-test-data">{testCase.testData || 'N/A'}</div>
                                  <div className="step-expected">
                                    {index === testCase.steps.length - 1 ? testCase.expectedResult : 'Step completed successfully'}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default App
